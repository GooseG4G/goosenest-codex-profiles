from uuid import UUID

from pydantic import BaseModel, Field


class DeviceIdentity(BaseModel):
    device_id: UUID = Field(
        ...,
        description="Authenticated device identifier",
    )

    user_id: UUID = Field(
        ...,
        description="User that owns the authenticated device",
    )
