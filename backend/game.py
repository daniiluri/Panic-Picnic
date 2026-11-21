"""Room transitions are synchronous. The transport serializes them per room."""

import secrets
from dataclasses import asdict, dataclass, field
from typing import Literal

from .protocol import (
    Avatar,
    Command,
    EndSet,
    Game,
    Joke,
    Participation,
    Playlist,
    Pulse,
    React,
    Reaction,
    Ready,
    StageInput,
)

GRACE = 60
WARMUP_SECONDS = 8
RESULTS_SECONDS = 5
PULSE_BURST = 4
AVAILABLE_GAMES: tuple[Game, ...] = ("frenzy", "hop")
COMEDY_SET_SECONDS = 30
Phase = Literal[
    "lobby",
    "playlist",
    "setup",
    "play",
    "results",
    "podium",
]


class GameError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise GameError(message)


@dataclass
class Player:
    id: str
    token: str
    name: str
    avatar: int
    # A new HTTP join also expires if its WebSocket never connects.
    expires: float | None
    connected: bool = False
    connected_since: float = 0
    ready: bool = False
    status: str = "pending"
    points: int = 0
    value: int = 0
    award: int = 0
    finish_ms: int | None = None
    last_pulse: float = 0
    pulse_credit: float = PULSE_BURST
    sequence: int = 0


@dataclass
class ComedySet:
    performer_id: str
    turn: int
    turns: int
    tomato_threshold: int
    reactions: dict[str, Reaction] = field(default_factory=dict)
    joke: str | None = None

    def snapshot(self) -> dict:
        tomatoes = sum(reaction == "tomato" for reaction in self.reactions.values())
        return {**asdict(self), "barrage": tomatoes >= self.tomato_threshold}


@dataclass
class Room:
    code: str
    players: dict[str, Player] = field(default_factory=dict)
    host: str = ""
    phase: Phase = "lobby"
    playlist: list[Game] = field(default_factory=lambda: list(AVAILABLE_GAMES))
    game_index: int = 0
    round_id: str = ""
    deadline: float | None = None
    started: float = 0
    participants: set[str] = field(default_factory=set)
    skipped: bool = False
    comedians: list[str] = field(default_factory=list)
    comedy: ComedySet | None = None

    @property
    def game(self) -> Game:
        return self.playlist[self.game_index]

    def join(self, name: str, now: float) -> Player:
        require(
            self.phase == "lobby",
            "This picnic is playing. Join when the host opens the next match.",
        )
        require(len(self.players) < 6, "This room is full. All six seats are taken.")
        require(
            all(p.name.casefold() != name.casefold() for p in self.players.values()),
            "That nickname is taken in this room.",
        )
        used = {p.avatar for p in self.players.values()}
        avatar = next(index for index in range(6) if index not in used)
        player = Player(
            secrets.token_hex(6), secrets.token_urlsafe(32), name, avatar, now + GRACE
        )
        self.players[player.id] = player
        if not self.host:
            self.host = player.id
            player.ready = True
        return player

    def connect(self, player: Player, now: float) -> None:
        player.connected_since = now
        player.connected = True
        player.expires = None
        if self.host not in self.players:
            self.host = player.id
            if self.phase == "lobby":
                player.ready = True

    def disconnect(self, player: Player, now: float) -> None:
        player.connected = False
        player.expires = now + GRACE
        if self.phase == "setup":
            player.status = "pending"
        if self.comedy and self.comedy.performer_id == player.id:
            self.next_set(now)

    def remove(self, pid: str) -> None:
        self.players.pop(pid)
        self.participants.discard(pid)
        if self.phase == "playlist" and len(self.players) < 2:
            self.phase = "lobby"
        if self.host == pid:
            successor = min(
                (p for p in self.players.values() if p.connected),
                key=lambda p: p.connected_since,
                default=None,
            )
            self.host = successor.id if successor else ""
            if successor and self.phase == "lobby":
                successor.ready = True

    def prepare(self, now: float) -> None:
        self.phase = "setup"
        self.round_id = secrets.token_hex(6)
        self.participants.clear()
        self.skipped = False
        self.deadline = now + WARMUP_SECONDS
        self.comedians.clear()
        self.comedy = None
        for p in self.players.values():
            p.status = "pending"
            p.value = p.award = p.sequence = 0
            p.finish_ms = None
            p.last_pulse = now
            p.pulse_credit = PULSE_BURST

    def finish(self, now: float) -> None:
        self.phase = "results"
        self.comedy = None
        self.deadline = now + RESULTS_SECONDS

        def rank(pid: str) -> tuple[int, int]:
            p = self.players[pid]
            return (1, -p.finish_ms) if p.finish_ms is not None else (0, p.value)

        for pid in self.participants:
            p = self.players[pid]
            p.award = sum(rank(pid) > rank(other) for other in self.participants)
            p.points += p.award

    def next_set(self, now: float) -> None:
        audience_size = sum(p.connected for p in self.players.values()) - 1
        first = self.comedy.turn if self.comedy else 0
        for index in range(first, len(self.comedians)):
            pid = self.comedians[index]
            if audience_size > 0 and pid in self.players and self.players[pid].connected:
                self.comedy = ComedySet(
                    performer_id=pid,
                    turn=index + 1,
                    turns=len(self.comedians),
                    tomato_threshold=audience_size // 2 + 1,
                )
                self.deadline = now + COMEDY_SET_SECONDS
                return
        self.finish(now)

    def advance(self, now: float) -> bool:
        changed = False
        for player in list(self.players.values()):
            if player.expires is not None and player.expires <= now:
                self.remove(player.id)
                changed = True
        if self.comedy and self.comedy.performer_id not in self.players:
            self.next_set(now)
            return True
        if self.deadline is None or now < self.deadline:
            return changed
        if self.phase == "results":
            if self.game_index + 1 == len(self.playlist):
                self.phase = "podium"
                self.deadline = None
            else:
                self.game_index += 1
                self.prepare(now)
        elif self.phase == "setup":
            ready = {p.id for p in self.players.values() if p.connected and p.status == "playing"}
            self.started = now
            if self.game == "comedy":
                can_start = bool(ready) and sum(p.connected for p in self.players.values()) >= 2
            else:
                can_start = len(ready) >= 2
            if not can_start:
                self.skipped = True
                self.finish(now)
                return True
            self.participants = ready
            self.phase = "play"
            if self.game == "comedy":
                self.comedians = [pid for pid in self.players if pid in ready]
                self.next_set(now)
            else:
                self.deadline = now + (20 if self.game == "frenzy" else 30)
        elif self.phase == "play":
            if self.comedy:
                self.next_set(now)
            else:
                self.finish(now)
        return True

    def action(self, p: Player, command: Command, now: float) -> None:
        kind = command.type
        if kind in {"start", "playlist", "launch", "rematch"}:
            require(p.id == self.host, "Only the host can do that.")
        if kind == "leave":
            self.remove(p.id)
            if self.comedy and self.comedy.performer_id == p.id:
                self.next_set(now)
            return
        if isinstance(command, Ready):
            require(self.phase == "lobby", "The lobby has closed.")
            p.ready = command.value
        elif kind == "start":
            require(self.phase == "lobby", "The match has already started.")
            require(
                sum(x.ready and x.connected for x in self.players.values()) >= 2,
                "Two connected players must be ready.",
            )
            self.phase = "playlist"
        elif isinstance(command, Playlist):
            require(self.phase == "playlist", "The lineup is locked.")
            require(
                all(game in AVAILABLE_GAMES for game in command.games),
                "That game is currently unavailable.",
            )
            require(
                len(set(command.games)) == len(command.games),
                "Choose each game only once.",
            )
            self.playlist = command.games
        elif kind == "launch":
            require(self.phase == "playlist", "Choose your lineup first.")
            require(
                sum(x.connected for x in self.players.values()) >= 2,
                "Wait for a second player to reconnect.",
            )
            self.game_index = 0
            self.prepare(now)
        elif isinstance(command, Avatar):
            require(self.phase == "lobby", "Choose your character in the starting lobby.")
            p.avatar = command.index
        elif isinstance(command, Participation):
            # Device startup may finish after the room clock has moved on.
            if self.phase == "setup" and command.round_id == self.round_id:
                p.status = command.status
        elif isinstance(command, Pulse):
            # The shared clock can close a round while its final camera frame is in flight.
            if (
                self.phase in {"results", "podium"}
                and command.round_id == self.round_id
                and p.id in self.participants
            ):
                return
            require(
                self.phase == "play"
                and self.game in {"frenzy", "hop"}
                and p.id in self.participants
                and command.round_id == self.round_id,
                "This input belongs to an inactive round.",
            )
            if command.sequence <= p.sequence or p.finish_ms is not None:
                return
            p.sequence = command.sequence
            # Wi-Fi can deliver several distinct camera frames or mic onsets together.
            pulses_per_second = 12 if self.game == "hop" else 60
            p.pulse_credit = min(
                PULSE_BURST, p.pulse_credit + (now - p.last_pulse) * pulses_per_second
            )
            p.last_pulse = now
            if p.pulse_credit < 1:
                return
            p.pulse_credit -= 1
            p.value += 1
            if self.game == "hop" and p.value == 12:
                p.finish_ms = round((now - self.started) * 1000)
                if all(
                    self.players[pid].finish_ms is not None for pid in self.participants
                ):
                    self.finish(now)
        elif isinstance(command, StageInput):
            stage = self.comedy
            # A reaction or a mic pass can arrive after the countdown has switched performers.
            if stage is None or command.round_id != self.round_id or command.turn != stage.turn:
                return
            if isinstance(command, React):
                require(p.id != stage.performer_id, "You can react only from the audience.")
                if p.id not in stage.reactions:
                    stage.reactions[p.id] = command.reaction
                    if command.reaction == "like":
                        self.players[stage.performer_id].value += 1
            else:
                require(p.id == stage.performer_id, "Only the performer can do that.")
                if isinstance(command, Joke) and stage.joke is None:
                    stage.joke = command.text
                elif isinstance(command, EndSet):
                    self.next_set(now)
        elif kind == "rematch":
            require(self.phase == "podium", "Finish the current match first.")
            self.phase = "lobby"
            self.game_index = 0
            self.participants.clear()
            self.comedians.clear()
            for player in self.players.values():
                player.ready = player.id == self.host
                player.points = player.value = player.award = 0
                player.status = "pending"

    def snapshot(self, now: float) -> dict:
        return {
            "type": "state",
            "code": self.code,
            "host": self.host,
            "phase": self.phase,
            "game": self.game,
            "game_index": self.game_index,
            "playlist": self.playlist,
            "round_id": self.round_id,
            "remaining_ms": max(0, round((self.deadline - now) * 1000))
            if self.deadline is not None
            else None,
            "comedy": self.comedy.snapshot() if self.comedy else None,
            "skipped": self.skipped,
            "players": [
                {
                    "id": p.id,
                    "name": p.name,
                    "avatar": p.avatar,
                    "ready": p.ready,
                    "connected": p.connected,
                    "status": p.status,
                    "points": p.points,
                    "value": p.value,
                    "award": p.award,
                    "finish_ms": p.finish_ms,
                    "sequence": p.sequence,
                    "playing": p.id in self.participants,
                }
                for p in self.players.values()
            ],
        }
