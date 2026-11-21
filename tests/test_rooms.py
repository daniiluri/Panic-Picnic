from unittest.mock import Mock

import pytest
from fastapi import WebSocket
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.websockets import WebSocketDisconnect

from backend.game import AVAILABLE_GAMES, GRACE, GameError, Room
from backend.main import Connection, LiveRoom, app
from backend.protocol import parse_command


def act(room, player, kind, now=1.0, **payload):
    command = parse_command.validate_python({"type": kind, **payload})
    room.action(player, command, now)


@pytest.fixture
def picnic():
    r = Room("TEST")
    a, b = (r.join(name, 0) for name in ["Dill", "Jam"])
    r.connect(a, 0)
    r.connect(b, 0)
    return r, a, b


@pytest.fixture
def comedy_picnic(picnic, monkeypatch):
    # Exercise the paused game in isolation while public rooms keep their normal lineup.
    monkeypatch.setattr("backend.game.AVAILABLE_GAMES", (*AVAILABLE_GAMES, "comedy"))
    return picnic


def setup_game(r, a, b, *games):
    act(r, b, "ready", value=True)
    act(r, a, "start")
    act(r, a, "playlist", games=list(games))
    act(r, a, "launch")


def start_at_deadline(r, a, b):
    for p in (a, b):
        act(r, p, "participation", status="playing", round_id=r.round_id)
    start = r.deadline
    assert start is not None and not r.advance(start - 0.1)
    assert r.advance(start)
    return start


def test_frenzy_relay_only_shares_current_players_during_play(picnic):
    room, a, b = picnic
    spectator = room.join("Egg", 0)
    room.connect(spectator, 0)
    live = LiveRoom(room, {pid: Connection(Mock(spec=WebSocket)) for pid in room.players})
    sender, receiver, viewer = (live.connections[p.id] for p in (a, b, spectator))
    setup_game(room, a, b, "frenzy", "hop")
    packet = room.round_id.encode() + b"\n\xff\xd8\xff" + b"frame-1\xff\xd9"
    live.relay_camera(a, sender, packet, 1)
    assert not viewer.frames
    start = start_at_deadline(room, a, b)
    live.relay_camera(spectator, viewer, packet, start)
    live.relay_camera(a, sender, b"old\n" + packet, start)
    live.relay_camera(a, sender, packet + b"x" * 49152, start)
    assert not receiver.frames
    live.relay_camera(a, sender, packet, start)
    newer = packet.replace(b"frame-1", b"frame-2")
    live.relay_camera(a, sender, newer, start + 0.01)
    assert viewer.frames == {a.id: a.id.encode() + b"\n" + packet}
    live.relay_camera(a, sender, newer, start + 0.1)
    assert viewer.frames == receiver.frames == {a.id: a.id.encode() + b"\n" + newer}
    assert not sender.frames
    live.remove_connection(a.id)
    assert not viewer.frames and not receiver.frames
    live.relay_camera(b, receiver, packet, start + 0.2)
    assert b.id in viewer.frames
    room.advance(room.deadline)
    live.publish()
    live.relay_camera(b, receiver, packet, room.deadline)
    assert not viewer.frames
    room.advance(room.deadline)
    start = start_at_deadline(room, a, b)
    current_packet = room.round_id.encode() + b"\n" + packet.split(b"\n", 1)[1]
    live.relay_camera(b, receiver, current_packet, start)
    assert not viewer.frames


def test_admission_and_host_permissions(picnic):
    r, a, b = picnic
    with pytest.raises(GameError, match="Two connected"):
        act(r, a, "start")
    with pytest.raises(GameError, match="Only the host"):
        act(r, b, "start")
    with pytest.raises(GameError, match="taken"):
        r.join("jAM", 0)
    for n in range(4):
        r.join(str(n), 0)
    with pytest.raises(GameError, match="full"):
        r.join("Overflow", 0)
    act(r, b, "ready", value=True)
    act(r, a, "start")
    with pytest.raises(GameError, match="playing"):
        r.join("Late", 0)
    with pytest.raises(GameError, match="only once"):
        act(r, a, "playlist", games=["hop", "hop"])


def test_character_choice_locks_until_room_returns_to_lobby(picnic):
    room, host, guest = picnic
    act(room, guest, "avatar", index=5)
    assert guest.avatar == 5
    act(room, guest, "ready", value=True)
    act(room, host, "start")

    def assert_locked():
        with pytest.raises(GameError, match="starting lobby"):
            act(room, guest, "avatar", index=3)
        assert guest.avatar == 5

    assert_locked()
    act(room, host, "playlist", games=["frenzy"])
    act(room, host, "launch")
    assert_locked()
    start_at_deadline(room, host, guest)
    assert_locked()
    room.advance(room.deadline)
    assert_locked()
    room.advance(room.deadline)
    assert_locked()
    act(room, host, "rematch")
    act(room, guest, "avatar", index=3)
    assert guest.avatar == 3


def test_frenzy_input_retries_ties_and_playlist(picnic):
    r, a, b = picnic
    setup_game(r, a, b, "frenzy", "hop")
    started = start_at_deadline(r, a, b)
    for p in (a, b):
        for sequence, delay in [(1, 0), (1, 0.09), (2, 0.12), (3, 0.13), (4, 0.24)]:
            act(r, p, "pulse", now=started + delay, sequence=sequence, round_id=r.round_id)
        assert p.value == 4
    buzzer = r.deadline
    r.advance(buzzer)
    assert r.phase == "results" and a.award == b.award == 0
    act(r, a, "pulse", now=buzzer + 0.02, sequence=5, round_id=r.round_id)
    assert a.value == 4 and a.points == 0
    previous_round = r.round_id
    r.advance(r.deadline)
    assert r.game == "hop" and r.phase == "setup" and a.value == b.value == 0
    act(r, b, "participation", status="playing", round_id=previous_round)
    assert b.status == "pending"
    with pytest.raises(GameError, match="inactive"):
        act(r, a, "pulse", now=26, sequence=3, round_id="old")


def test_frenzy_scores_rapid_frames_delivered_together(picnic):
    room, host, guest = picnic
    setup_game(room, host, guest, "frenzy")
    start = start_at_deadline(room, host, guest)
    for sequence in range(1, 7):
        act(room, host, "pulse", now=start, sequence=sequence, round_id=room.round_id)
    assert host.value == 4
    for sequence in range(7, 27):
        now = start + (sequence - 6) * 0.035
        act(room, host, "pulse", now=now, sequence=sequence, round_id=room.round_id)
    assert host.value == 24


def test_hop_rank_finishers_and_distance(picnic):
    r, a, b = picnic
    c = r.join("Egg", 0)
    r.connect(c, 0)
    setup_game(r, a, b, "hop")
    act(r, c, "participation", status="playing", round_id=r.round_id)
    started = start_at_deadline(r, a, b)
    for sequence in range(1, 13):
        for p in [a, b, c]:
            if sequence <= {a.id: 12, b.id: 8, c.id: 4}[p.id]:
                act(
                    r,
                    p,
                    "pulse",
                    now=started + sequence * 0.09,
                    round_id=r.round_id,
                    sequence=sequence,
                )
    r.advance(r.deadline)
    assert (a.finish_ms, b.finish_ms) == (1080, None)
    assert (a.points, b.points, c.points) == (2, 1, 0)
    r.advance(r.deadline)
    assert a.points == 2 and r.phase == "podium" and r.deadline is None
    act(r, a, "rematch")
    assert r.phase == "lobby" and a.ready and not b.ready and a.points == 0


def test_public_lineups_only_allow_available_games(picnic):
    room, host, guest = picnic
    assert room.playlist == ["frenzy", "hop"]
    act(room, guest, "ready", value=True)
    act(room, host, "start")
    for games in (["quiz"], ["comedy"], ["hop", "quiz"], ["frenzy", "comedy"]):
        with pytest.raises(GameError, match="unavailable"):
            act(room, host, "playlist", games=games)
    with pytest.raises(ValidationError):
        act(room, host, "playlist", games=["looking"])
    assert room.playlist == ["frenzy", "hop"]
    act(room, host, "launch")
    assert room.game == "frenzy" and room.phase == "setup"


def test_opt_out_skip_and_reservation(picnic):
    r, a, b = picnic
    setup_game(r, a, b, "frenzy")
    act(r, a, "participation", status="playing", round_id=r.round_id)
    act(r, b, "participation", status="sitting", round_id=r.round_id)
    r.advance(r.deadline)
    assert r.skipped and r.phase == "results" and a.points == b.points == 0
    r.advance(r.deadline)
    assert r.phase == "podium"
    r.disconnect(a, 2)
    r.advance(2 + GRACE - 0.1)
    assert r.host == a.id
    r.connect(a, 0)
    r.advance(2 + GRACE)
    assert r.host == a.id
    r.disconnect(a, 90)
    r.advance(90 + GRACE)
    assert r.host == b.id and a.id not in r.players
    act(r, b, "rematch")


def test_pending_seats_expire_and_lineup_reopens(picnic):
    r, a, b = picnic
    c = r.join("Never connected", 0)
    act(r, b, "ready", value=True)
    act(r, a, "start")
    r.remove(b.id)
    r.advance(GRACE)
    assert c.id not in r.players and r.phase == "lobby"
    assert r.join("New friend", GRACE).id != b.id


def test_http_and_authenticated_socket():
    with TestClient(app) as client:
        assert client.post("/api/rooms", json={"name": " "}).status_code == 422
        assert (
            client.post("/api/rooms/XXXX/join", json={"name": "Player"}).status_code
            == 404
        )
        seat = client.post("/api/rooms", json={"name": "Host"}).json()
        path = "/api/rooms/" + seat["code"] + "/live"
        with client.websocket_connect(path) as ws:
            ws.send_json({"type": "auth", "token": seat["token"]})
            state = ws.receive_json()
            assert state["host"] == seat["player_id"] and "token" not in str(state)
            ws.send_json({"type": "start"})
            assert ws.receive_json()["type"] == "error"
        with client.websocket_connect(path) as ws:
            ws.send_json({"type": "auth", "token": seat["token"]})
            assert ws.receive_json()["players"][0]["connected"]
        with client.websocket_connect(path) as ws:
            ws.send_json({"type": "auth", "token": "x" * 43})
            with pytest.raises(WebSocketDisconnect) as closed:
                ws.receive_json()
            assert closed.value.code == 4004


def test_host_transfer_uses_continuous_connection_time(picnic):
    room, host, first_guest = picnic
    newer_guest = room.join("Pop", 1)
    room.connect(newer_guest, 1)
    room.disconnect(first_guest, 2)
    room.connect(first_guest, 3)
    room.remove(host.id)
    assert room.host == newer_guest.id
    assert newer_guest.ready
    act(room, first_guest, "ready", value=True)
    act(room, newer_guest, "start")
    assert room.phase == "playlist"


def test_playlist_progresses_with_host_offline_and_an_unanswered_device_request(picnic):
    room, host, guest = picnic
    third = room.join("Pop", 0)
    room.connect(third, 0)
    setup_game(room, host, guest, "frenzy", "hop")
    room.disconnect(host, 2)
    # An unanswered device prompt cannot hold the room on the introduction.
    act(room, guest, "participation", status="playing", round_id=room.round_id)
    room.advance(room.deadline)
    assert room.skipped
    room.advance(room.deadline)
    assert room.phase == "setup" and room.game == "hop"
    start_at_deadline(room, guest, third)
    assert room.phase == "play" and room.participants == {guest.id, third.id}
    room.advance(room.deadline)
    room.advance(room.deadline)
    assert room.phase == "podium"


def test_comedy_turns_reactions_scores_and_retries(comedy_picnic):
    room, host, guest = comedy_picnic
    third = room.join("Toast", 0)
    spectator = room.join("Egg", 0)
    for p in (third, spectator):
        room.connect(p, 0)
    setup_game(room, host, guest, "comedy", "hop", "frenzy")
    round_id = room.round_id
    act(room, third, "participation", round_id=round_id, status="playing")
    start = start_at_deadline(room, host, guest)
    stage = room.snapshot(start)["comedy"]
    assert stage == {
        "performer_id": host.id, "turn": 1, "turns": 3, "joke": None,
        "tomato_threshold": 2, "reactions": {}, "barrage": False,
    }
    turn = {"round_id": round_id, "turn": 1}
    with pytest.raises(GameError, match="Only the performer"):
        act(room, guest, "joke", start, text="Someone else's line", **turn)
    with pytest.raises(GameError, match="Only the performer"):
        act(room, spectator, "end_set", start, **turn)
    with pytest.raises(GameError, match="only from the audience"):
        act(room, host, "react", start, reaction="like", **turn)
    with pytest.raises(GameError, match="inactive"):
        act(room, host, "pulse", start, sequence=1, round_id=round_id)
    act(room, host, "joke", start, text="  A picnic joke.  ", **turn)
    act(room, host, "joke", start, text="An accidental second send.", **turn)
    assert room.comedy.joke == "A picnic joke."
    act(room, guest, "react", start, reaction="like", **turn)
    act(room, guest, "react", start, reaction="tomato", **turn)
    room.disconnect(guest, start)
    room.connect(guest, start + 1)
    act(room, guest, "react", start + 1, reaction="like", **turn)
    assert host.value == 1
    act(room, spectator, "react", start + 1, reaction="tomato", **turn)
    assert not room.snapshot(start + 1)["comedy"]["barrage"]
    act(room, third, "react", start + 2, reaction="tomato", **turn)
    assert room.snapshot(start + 2)["comedy"]["barrage"]

    act(room, host, "end_set", start + 3, **turn)
    assert room.comedy.performer_id == guest.id and not room.comedy.reactions
    assert room.comedy.joke is None and room.deadline == start + 33
    act(room, host, "end_set", start + 3, **turn)
    act(room, third, "react", start + 3, reaction="tomato", **turn)
    for p in (host, third):
        act(room, p, "react", start + 4, round_id=round_id, turn=2, reaction="like")
    assert guest.value == 2 and len(room.comedy.reactions) == 2
    assert room.advance(room.deadline)
    assert room.comedy.performer_id == third.id
    assert room.advance(room.deadline)
    assert room.phase == "results" and not room.comedy
    assert (host.points, guest.points, third.points, spectator.points) == (1, 2, 0, 0)
    act(room, guest, "react", room.deadline, round_id=round_id, turn=3, reaction="like")
    room.advance(room.deadline)
    assert room.game == "hop" and room.phase == "setup" and not room.comedy


def test_comedy_skips_absent_comedians_and_passes_mic_on_departure(comedy_picnic):
    room, host, guest = comedy_picnic
    third = room.join("Toast", 0)
    watcher = room.join("Egg", 0)
    for p in (third, watcher):
        room.connect(p, 0)
    setup_game(room, host, guest, "comedy")
    act(room, third, "participation", round_id=room.round_id, status="playing")
    now = start_at_deadline(room, host, guest)
    room.disconnect(guest, now + 1)
    act(room, host, "leave", now + 2)
    assert room.comedy.turn == 3 and room.comedy.performer_id == third.id
    assert room.comedy.tomato_threshold == 1
    room.connect(guest, now + 3)
    room.disconnect(third, now + 4)
    assert room.phase == "results" and room.comedy is None
    assert all(p.points == 0 for p in room.players.values())


def test_one_comedian_can_perform_for_an_audience_only_guest(comedy_picnic):
    room, host, guest = comedy_picnic
    setup_game(room, host, guest, "comedy")
    act(room, host, "participation", round_id=room.round_id, status="playing")
    act(room, guest, "participation", round_id=room.round_id, status="sitting")
    start = room.deadline
    room.advance(start)
    assert room.phase == "play" and room.participants == {host.id}
    assert room.comedy.turns == 1 and room.comedy.tomato_threshold == 1
    act(room, guest, "react", start + 1, round_id=room.round_id, turn=1, reaction="like")
    room.advance(room.deadline)
    assert room.phase == "results" and host.value == 1 and not room.skipped


def test_comedy_voice_is_bound_to_performer_turn_and_has_a_bounded_queue(comedy_picnic):
    room, host, guest = comedy_picnic
    live = LiveRoom(room, {pid: Connection(Mock(spec=WebSocket)) for pid in room.players})
    sender, viewer = (live.connections[p.id] for p in (host, guest))
    setup_game(room, host, guest, "comedy")
    live.relay_voice(host, sender, bytes(3200), 1)
    start = start_at_deadline(room, host, guest)
    header = f"voice\n{room.round_id}\n1\n".encode()
    packet = header + bytes(3200)
    live.relay_voice(guest, viewer, packet, start)
    for bad in (bytes(3200), packet[:-1], packet + b"x", packet.replace(b"\n1\n", b"\n2\n")):
        live.relay_voice(host, sender, bad, start)
    assert not sender.voice and not viewer.voice and not sender.voice_times
    frames = [header + bytes([n]) * 3200 for n in range(13)]
    for frame in frames:
        live.relay_voice(host, sender, frame, start)
    assert len(sender.voice_times) == 12
    assert not sender.voice and list(viewer.voice) == frames[8:12]
    assert viewer.wake.is_set() and viewer.outgoing.empty()
    live.publish()
    assert viewer.voice[-1] == frames[11]
    live.relay_voice(host, sender, frames[12], start + 1)
    assert viewer.voice[-1] == frames[12]
    act(room, host, "end_set", start + 2, round_id=room.round_id, turn=1)
    live.publish()
    assert not viewer.voice
    live.relay_voice(host, sender, packet, start + 2)
    live.relay_voice(guest, viewer, packet, start + 2)
    assert not sender.voice and not viewer.voice
    live.relay_voice(guest, viewer, packet.replace(b"\n1\n", b"\n2\n"), start + 2)
    assert len(sender.voice) == 1
    room.advance(room.deadline)
    live.publish()
    assert not sender.voice and not viewer.voice
