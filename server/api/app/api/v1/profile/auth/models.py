from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class DeviceAuthStarted(BaseModel):
    uid: UUID
    one_time_code: str = Field(..., min_length=1)
    verification_url: str = Field(..., min_length=1)
    expires_in: int = Field(default=900, gt=0)
    status: Literal["pending"] = "pending"


class DeviceAuthStatus(BaseModel):
    uid: UUID
    status: Literal["pending", "authorized", "expired", "failed"]
    profile_id: UUID | None = None
    detail: str | None = None
