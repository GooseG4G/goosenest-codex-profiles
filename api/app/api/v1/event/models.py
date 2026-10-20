from datetime import datetime, timezone
from typing import Annotated, Literal, Optional, TypeAlias
from uuid import UUID, uuid4

from api.v1.session.auth import Role
from pydantic import BaseModel, Field


class EventAudience(BaseModel):
    roles: frozenset[Role] = Field(
        default_factory=lambda: frozenset({"administrator"}),
        description="Roles allowed to receive the event",
    )

    user_ids: frozenset[UUID] = Field(
        default_factory=frozenset,
        description="Users explicitly allowed to receive the event",
    )


class Event(BaseModel):
    version: Literal[1] = Field(
        default=1,
        description="Event schema version",
    )

    event_id: UUID = Field(
        default_factory=uuid4,
        description="Unique event identifier",
    )

    occurred_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Time when the event occurred",
    )

    audience: EventAudience = Field(
        default_factory=EventAudience,
        description="Event delivery audience",
    )


class ProfileUsageUpdated(Event):
    type: Literal["profile.usage.updated"] = Field(
        default="profile.usage.updated",
        description="Event type",
    )

    profile_id: UUID = Field(
        ...,
        description="Updated profile identifier",
    )


class ProfilePlanUpdated(Event):
    type: Literal["profile.plan.updated"] = Field(
        default="profile.plan.updated",
        description="Event type",
    )

    profile_id: UUID = Field(
        ...,
        description="Updated profile identifier",
    )


class ProfileUsageResetCompleted(Event):
    type: Literal["profile.usage.reset.completed"] = Field(
        default="profile.usage.reset.completed",
        description="Event type",
    )

    profile_id: UUID = Field(
        ...,
        description="Updated profile identifier",
    )

    outcome: Literal[
        "reset",
        "nothingToReset",
        "noCredit",
        "alreadyRedeemed",
    ] = Field(
        ...,
        description="Usage reset outcome",
    )


class ProfileAuthChanged(Event):
    type: Literal["profile.auth.changed"] = Field(
        default="profile.auth.changed",
        description="Event type",
    )

    profile_id: UUID = Field(
        ...,
        description="Updated profile identifier",
    )

    auth_status: Literal["authorized", "expired"] = Field(
        ...,
        description="Current profile authorization status",
    )

    flow_id: Optional[UUID] = Field(
        default=None,
        description="Device authorization flow identifier",
    )


ServerEvent: TypeAlias = Annotated[
    ProfileUsageUpdated
    | ProfilePlanUpdated
    | ProfileUsageResetCompleted
    | ProfileAuthChanged,
    Field(discriminator="type"),
]


class StreamEvent(BaseModel):
    stream_id: str = Field(
        ...,
        min_length=1,
        description="Event stream entry identifier",
    )

    event: ServerEvent = Field(
        ...,
        description="Event payload",
    )
