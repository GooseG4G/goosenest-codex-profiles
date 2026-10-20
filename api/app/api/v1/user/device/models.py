from datetime import datetime
from typing import Literal, Optional, TypeAlias
from uuid import UUID

from api.v1.models import Entities, Entity, Meta
from pydantic import BaseModel, Field

DEVICE_TYPE = "device"


class DeviceMeta(Meta):
    type: Literal["device"] = Field(
        default=DEVICE_TYPE,
        description="Resource type",
    )


class DeviceCreate(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Device display name",
    )


class DeviceUpdate(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        description="Replacement device display name",
    )

    enabled: Optional[bool] = Field(
        default=None,
        description="Replacement device enabled state",
    )


class DeviceEntity(Entity[DeviceMeta]):
    device_id: UUID = Field(
        ...,
        description="Device identifier",
    )

    user_id: UUID = Field(
        ...,
        description="User that owns the device",
    )

    name: str = Field(
        ...,
        description="Device display name",
    )

    enabled: bool = Field(
        ...,
        description="Whether the device may access the API",
    )

    created_at: datetime = Field(
        ...,
        description="Time when the device was created",
    )

    last_used_at: Optional[datetime] = Field(
        default=None,
        description="Time when the device was last used",
    )


class DeviceIssued(DeviceEntity):
    secret: str = Field(
        ...,
        min_length=1,
        description="Secret issued to the device",
    )


DeviceEntities: TypeAlias = Entities[DeviceMeta, DeviceEntity]
