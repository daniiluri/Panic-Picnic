import asyncio
import secrets
from collections import deque
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass, field
from pathlib import Path
from time import monotonic
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import Field, ValidationError

from .game import GameError, Player, Room
from .protocol import Identity, Message, parse_command

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
VOICE_FRAME_BYTES = 3200  # 100 ms of 16 kHz mono signed 16-bit PCM


class Auth(Message):
    type: Literal["auth"]
    token: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")


@dataclass
class Close:
    code: int
    reason: str


@dataclass
class Connection:
    socket: WebSocket
    outgoing: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=32))
    frames: dict[str, bytes] = field(default_factory=dict)
    wake: asyncio.Event = field(default_factory=asyncio.Event)
    last_frame: float = 0
    voice: deque[bytes] = field(default_factory=lambda: deque(maxlen=4))
    voice_times: deque[float] = field(default_factory=lambda: deque(maxlen=12))

    def push(self, message: dict | Close) -> None:
        if self.outgoing.full():
            self.outgoing.get_nowait()
        self.outgoing.put_nowait(message)
        self.wake.set()

    def preview(self, player_id: str, frame: bytes) -> None:
        # Keep only the newest image from each camera for this viewer.
        self.frames[player_id] = frame
        self.wake.set()

    async def write(self) -> None:
        while True:
            if not self.outgoing.empty():
                message = self.outgoing.get_nowait()
                if isinstance(message, Close):
                    await self.socket.close(code=message.code, reason=message.reason)
                    return
                await asyncio.wait_for(self.socket.send_json(message), timeout=5)
            elif self.frames:
                frame = self.frames.pop(next(iter(self.frames)))
                await asyncio.wait_for(self.socket.send_bytes(frame), timeout=5)
            elif self.voice:
                await asyncio.wait_for(self.socket.send_bytes(self.voice.popleft()), timeout=5)
            else:
                self.wake.clear()
                await self.wake.wait()


@dataclass
class LiveRoom:
    game: Room
    connections: dict[str, Connection] = field(default_factory=dict)

    def remove_connection(self, player_id: str) -> None:
        del self.connections[player_id]
        for viewer in self.connections.values():
            viewer.frames.pop(player_id, None)

    def publish(self) -> None:
        state = self.game.snapshot(monotonic())
        voice_header = self.voice_header()
        for connection in self.connections.values():
            if self.game.phase != "play" or self.game.game != "frenzy":
                connection.frames.clear()
            if connection.voice and (
                voice_header is None or not connection.voice[0].startswith(voice_header)
            ):
                connection.voice.clear()
            connection.push(state)

    def voice_header(self) -> bytes | None:
        stage = self.game.comedy
        if stage is None:
            return None
        return f"voice\n{self.game.round_id}\n{stage.turn}\n".encode()

    def relay_voice(self, player: Player, connection: Connection, packet: bytes, now: float) -> None:
        stage = self.game.comedy
        if stage is None or stage.performer_id != player.id:
            return
        header = self.voice_header()
        if header is None or len(packet) != len(header) + VOICE_FRAME_BYTES or not packet.startswith(header):
            return
        times = connection.voice_times
        if len(times) == times.maxlen and now - times[0] < 1:
            return
        times.append(now)
        for pid, viewer in self.connections.items():
            if pid != player.id:
                viewer.voice.append(packet)
                viewer.wake.set()

    def relay_camera(self, player: Player, connection: Connection, packet: bytes, now: float) -> None:
        if (
            self.game.phase != "play"
            or self.game.game != "frenzy"
            or player.id not in self.game.participants
            or len(packet) > 48 * 1024
            or now - connection.last_frame < 0.075
        ):
            return
        # Both hops carry the round id. The server supplies the camera owner's id.
        if not (
            packet.startswith(self.game.round_id.encode() + b"\n\xff\xd8\xff")
            and packet.endswith(b"\xff\xd9")
        ):
            return
        connection.last_frame = now
        frame = player.id.encode() + b"\n" + packet
        for viewer_id, viewer in self.connections.items():
            if viewer_id != player.id:
                viewer.preview(player.id, frame)


rooms: dict[str, LiveRoom] = {}


async def clock() -> None:
    while True:
        await asyncio.sleep(0.08)
        for code, live in list(rooms.items()):
            if live.game.advance(monotonic()):
                live.publish()
            if not live.game.players:
                rooms.pop(code, None)


@asynccontextmanager
async def lifespan(_: FastAPI):
    timer = asyncio.create_task(clock())
    try:
        yield
    finally:
        timer.cancel()
        with suppress(asyncio.CancelledError):
            await timer
        rooms.clear()


app = FastAPI(title="Panic Picnic", lifespan=lifespan)


def admit(live: LiveRoom, identity: Identity) -> dict:
    try:
        player = live.game.join(identity.name, monotonic())
    except GameError as exc:
        raise HTTPException(409, str(exc)) from exc
    live.publish()
    return {"code": live.game.code, "player_id": player.id, "token": player.token}


@app.post("/api/rooms", status_code=201)
async def create_room(identity: Identity):
    while True:
        code = "".join(secrets.choice(ALPHABET) for _ in range(4))
        if code not in rooms:
            break
    live = LiveRoom(Room(code))
    rooms[code] = live
    return admit(live, identity)


@app.post("/api/rooms/{code}/join")
async def join_room(code: str, identity: Identity):
    live = rooms.get(code.upper())
    if live is None:
        raise HTTPException(404, "Room not found. Check the four-character code.")
    return admit(live, identity)


async def receive(live: LiveRoom, player: Player, connection: Connection) -> None:
    while True:
        message = await connection.socket.receive()
        if message["type"] == "websocket.disconnect":
            return
        if live.connections.get(player.id) is not connection:
            continue
        now = monotonic()
        if live.game.advance(now):
            live.publish()
        if message.get("bytes") is not None:
            if live.game.game == "comedy":
                live.relay_voice(player, connection, message["bytes"], now)
            else:
                live.relay_camera(player, connection, message["bytes"], now)
            continue
        try:
            command = parse_command.validate_json(message["text"])
            live.game.action(player, command, now)
        except GameError as exc:
            connection.push({"type": "error", "message": str(exc)})
            continue
        except ValidationError:
            connection.push({"type": "error", "message": "Invalid game input."})
            continue
        if command.type == "leave":
            live.remove_connection(player.id)
            connection.push(Close(4000, "You left the room."))
        live.publish()


@app.websocket("/api/rooms/{code}/live")
async def live_socket(socket: WebSocket, code: str):
    origin = socket.headers.get("origin")
    if origin and urlsplit(origin).netloc != socket.headers.get("host"):
        await socket.close(code=1008)
        return
    await socket.accept()
    try:
        auth = Auth.model_validate_json(
            await asyncio.wait_for(socket.receive_text(), timeout=8)
        )
    except (ValidationError, TimeoutError, WebSocketDisconnect):
        with suppress(WebSocketDisconnect, RuntimeError):
            await socket.close(code=4004, reason="Room access expired.")
        return
    live = rooms.get(code.upper())
    player = (
        next(
            (
                p
                for p in live.game.players.values()
                if secrets.compare_digest(p.token, auth.token)
            ),
            None,
        )
        if live
        else None
    )
    if (
        not live
        or not player
        or (player.expires is not None and player.expires <= monotonic())
    ):
        await socket.close(code=4004, reason="Your seat expired. Join a room again.")
        return
    old = live.connections.get(player.id)
    connection = Connection(socket)
    live.connections[player.id] = connection
    live.game.connect(player, monotonic())
    live.publish()
    tasks = [
        asyncio.create_task(connection.write()),
        asyncio.create_task(receive(live, player, connection)),
    ]
    try:
        if old:
            old.push(Close(4001, "Room reopened in another tab."))
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    except (WebSocketDisconnect, TimeoutError):
        pass
    finally:
        if live.connections.get(player.id) is connection:
            live.remove_connection(player.id)
            if player.id in live.game.players:
                live.game.disconnect(player, monotonic())
            live.publish()
        for task in tasks:
            task.cancel()
        # Let both socket tasks finish cleanup if the ASGI session is cancelled during disconnect.
        await asyncio.shield(asyncio.gather(*tasks, return_exceptions=True))


dist = Path(__file__).resolve().parents[1] / "frontend-react" / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="arcade")
