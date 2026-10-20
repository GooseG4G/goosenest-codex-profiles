from datetime import datetime
from typing import Any, Dict, Literal, Optional, TypeAlias
from uuid import UUID

from api.v1.models import Entities, Entity, Meta
from pydantic import BaseModel, Field

PROFILE_TYPE = "profile"


class ProfileMeta(Meta):
    type: Literal["profile"] = Field(
        default=PROFILE_TYPE,
        description="Resource type",
    )


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        description="Replacement profile display name",
    )

    enabled: Optional[bool] = Field(
        default=None,
        description="Replacement profile enabled state",
    )


class ProfileEntity(Entity[ProfileMeta]):
    profile_id: UUID = Field(
        ...,
        description="Profile identifier",
    )

    name: str = Field(
        ...,
        description="Profile display name",
    )

    enabled: bool = Field(
        ...,
        description="Whether the profile may serve requests",
    )

    auth_status: str = Field(
        ...,
        description="Current Codex authorization status",
    )

    usage: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Last stored Codex usage snapshot",
    )

    usage_updated_at: Optional[datetime] = Field(
        default=None,
        description="Time when usage was last refreshed",
    )

    created_at: datetime = Field(
        ...,
        description="Time when the profile was created",
    )

    updated_at: datetime = Field(
        ...,
        description="Time when the profile was last updated",
    )

    last_used_at: Optional[datetime] = Field(
        default=None,
        description="Time when the profile last served a request",
    )

    active_requests: int = Field(
        default=0,
        ge=0,
        description="Number of currently active requests",
    )


ProfileEntities: TypeAlias = Entities[ProfileMeta, ProfileEntity]


class ProfileRuntime(ProfileEntity):
    codex_home: str = Field(
        ...,
        min_length=1,
        description="Filesystem path to the isolated Codex home",
    )
