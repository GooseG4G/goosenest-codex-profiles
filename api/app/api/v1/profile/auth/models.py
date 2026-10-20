from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class DeviceAuthStarted(BaseModel):
    uid: UUID = Field(
        ...,
        description="Device authorization flow identifier",
    )

    one_time_code: str = Field(
        ...,
        min_length=1,
        description="One-time device authorization code",
    )

    verification_url: str = Field(
        ...,
        min_length=1,
        description="URL where the device code must be entered",
    )

    expires_in: int = Field(
        default=900,
        gt=0,
        description="Number of seconds before the flow expires",
    )

    status: Literal["pending"] = Field(
        default="pending",
        description="Current device authorization status",
    )


class DeviceAuthStatus(BaseModel):
    uid: UUID = Field(
        ...,
        description="Device authorization flow identifier",
    )

    status: Literal["pending", "authorized", "expired", "failed"] = Field(
        ...,
        description="Current device authorization status",
    )

    profile_id: Optional[UUID] = Field(
        default=None,
        description="Profile created or updated by the flow",
    )

    detail: Optional[str] = Field(
        default=None,
        description="Failure or completion detail",
    )
