from datetime import datetime, timezone
from typing import Annotated, Literal, TypeAlias
from uuid import UUID

from pydantic import BaseModel, Field


class Event(BaseModel):
    version: Literal[1] = 1
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProfileUsageUpdated(Event):
    type: Literal["profile.usage.updated"] = "profile.usage.updated"
    profile_id: UUID


class ProfileUsageResetCompleted(Event):
    type: Literal["profile.usage.reset.completed"] = "profile.usage.reset.completed"
    profile_id: UUID
    outcome: Literal["reset", "nothingToReset", "noCredit", "alreadyRedeemed"]


ServerEvent: TypeAlias = Annotated[
    ProfileUsageUpdated | ProfileUsageResetCompleted,
    Field(discriminator="type"),
]


class StreamEvent(BaseModel):
    stream_id: str
    event: ServerEvent
