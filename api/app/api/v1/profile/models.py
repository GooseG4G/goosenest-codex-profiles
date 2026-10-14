from datetime import datetime
from typing import Any, Dict, Literal, Optional, TypeAlias
from uuid import UUID

from api.v1.models import Entities, Entity, Meta
from pydantic import BaseModel, Field

PROFILE_TYPE = "profile"


class ProfileMeta(Meta):
    type: Literal["profile"] = Field(
        default=PROFILE_TYPE,
    )


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
    )

    enabled: Optional[bool] = Field(
        default=None,
    )

    subscription_expires_at: Optional[datetime] = Field(
        default=None,
    )


class ProfileEntity(Entity[ProfileMeta]):
    profile_id: UUID = Field(
        ...,
    )

    name: str = Field(
        ...,
    )

    enabled: bool = Field(
        ...,
    )

    auth_status: str = Field(
        ...,
    )

    usage: Optional[Dict[str, Any]] = Field(
        default=None,
    )

    usage_updated_at: Optional[datetime] = Field(
        default=None,
    )

    subscription_expires_at: Optional[datetime] = Field(
        default=None,
    )

    created_at: datetime = Field(
        ...,
    )

    updated_at: datetime = Field(
        ...,
    )

    last_used_at: Optional[datetime] = Field(
        default=None,
    )

    active_requests: int = Field(
        default=0,
        ge=0,
    )


ProfileEntities: TypeAlias = Entities[ProfileMeta, ProfileEntity]


class ProfileRuntime(ProfileEntity):
    codex_home: str = Field(
        ...,
        min_length=1,
    )


class DeviceAuthStarted(BaseModel):
    uid: UUID = Field(
        ...,
    )

    one_time_code: str = Field(
        ...,
        min_length=1,
    )

    verification_url: str = Field(
        ...,
        min_length=1,
    )

    expires_in: int = Field(
        default=900,
        gt=0,
    )

    status: Literal["pending"] = Field(
        default="pending",
    )


class DeviceAuthStatus(BaseModel):
    uid: UUID = Field(
        ...,
    )

    status: Literal["pending", "authorized", "expired", "failed"] = Field(
        ...,
    )

    profile_id: Optional[UUID] = Field(
        default=None,
    )

    detail: Optional[str] = Field(
        default=None,
    )
