from datetime import datetime
from typing import Any, Dict, Literal, Optional, TypeAlias
from uuid import UUID

from api.v1.models import Entities, Entity, Meta
from pydantic import BaseModel, Field

PROFILE_TYPE = "profile"


class ProfileMeta(Meta):
    type: Literal["profile"] = PROFILE_TYPE


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    enabled: Optional[bool] = None
    subscription_expires_at: Optional[datetime] = None


class ProfileEntity(Entity[ProfileMeta]):
    profile_id: UUID
    name: str
    enabled: bool
    auth_status: str
    usage: Optional[Dict[str, Any]] = None
    usage_updated_at: Optional[datetime] = None
    subscription_expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    last_used_at: Optional[datetime] = None
    active_requests: int = 0


ProfileEntities: TypeAlias = Entities[ProfileMeta, ProfileEntity]


class ProfileRuntime(ProfileEntity):
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
    profile_id: Optional[UUID] = None
    detail: Optional[str] = None
