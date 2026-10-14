from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ProfileUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    enabled: bool | None = None


class ProfileRead(BaseModel):
    profile_id: UUID
    name: str
    enabled: bool
    auth_status: str
    usage: dict[str, Any] | None = None
    usage_updated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    last_used_at: datetime | None = None


class ProfileRuntime(ProfileRead):
    codex_home: str


class DeviceAuthStarted(BaseModel):
    uid: UUID
    one_time_code: str
    verification_url: str
    expires_in: int = 900
    status: Literal["pending"] = "pending"


class DeviceAuthStatus(BaseModel):
    uid: UUID
    status: Literal["pending", "authorized", "expired", "failed"]
    profile_id: UUID | None = None
    detail: str | None = None
