from datetime import datetime, timezone
from typing import Annotated, Literal, TypeAlias
from uuid import UUID, uuid4

from api.v1.session.auth import Role
from pydantic import BaseModel, Field


class EventAudience(BaseModel):
    roles: frozenset[Role] = Field(default_factory=lambda: frozenset({"administrator"}))
    user_ids: frozenset[UUID] = Field(default_factory=frozenset)


class Event(BaseModel):
    version: Literal[1] = 1
    event_id: UUID = Field(default_factory=uuid4)
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    audience: EventAudience = Field(default_factory=EventAudience)


class ProfileUsageUpdated(Event):
    type: Literal["profile.usage.updated"] = "profile.usage.updated"
    profile_id: UUID


class ProfilePlanUpdated(Event):
    type: Literal["profile.plan.updated"] = "profile.plan.updated"
    profile_id: UUID


class ProfileUsageResetCompleted(Event):
    type: Literal["profile.usage.reset.completed"] = "profile.usage.reset.completed"
    profile_id: UUID
    outcome: Literal["reset", "nothingToReset", "noCredit", "alreadyRedeemed"]


class ProfileAuthChanged(Event):
    type: Literal["profile.auth.changed"] = "profile.auth.changed"
    profile_id: UUID
    auth_status: Literal["authorized", "expired"]
    flow_id: UUID | None = None


ServerEvent: TypeAlias = Annotated[
    ProfileUsageUpdated
    | ProfilePlanUpdated
    | ProfileUsageResetCompleted
    | ProfileAuthChanged,
    Field(discriminator="type"),
]


class StreamEvent(BaseModel):
    stream_id: str
    event: ServerEvent
