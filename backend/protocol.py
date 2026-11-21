from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter

Game = Literal["frenzy", "quiz", "hop", "comedy"]
Reaction = Literal["like", "tomato"]
Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)
]


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Identity(Message):
    name: Name


class Ready(Message):
    type: Literal["ready"]
    value: bool


class Navigate(Message):
    type: Literal["start", "launch", "rematch", "leave"]


class Playlist(Message):
    type: Literal["playlist"]
    games: list[Game] = Field(min_length=1, max_length=4)


class Avatar(Message):
    type: Literal["avatar"]
    index: int = Field(ge=0, lt=6)


class RoundInput(Message):
    round_id: str = Field(max_length=32)


class Participation(RoundInput):
    type: Literal["participation"]
    status: Literal["playing", "sitting"]


class Pulse(RoundInput):
    type: Literal["pulse"]
    sequence: int = Field(ge=1)


class StageInput(RoundInput):
    turn: int = Field(ge=1, le=6)


class React(StageInput):
    type: Literal["react"]
    reaction: Reaction


class Joke(StageInput):
    type: Literal["joke"]
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]


class EndSet(StageInput):
    type: Literal["end_set"]


Command = Annotated[
    Ready | Navigate | Playlist | Avatar | Participation | Pulse | React | Joke | EndSet,
    Field(discriminator="type"),
]
parse_command = TypeAdapter(Command)
