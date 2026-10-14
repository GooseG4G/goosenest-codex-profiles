from datetime import datetime
from typing import Literal, Optional, TypeAlias
from uuid import UUID

from api.v1.models import Entities, Entity, Meta
from pydantic import BaseModel, Field

DEVICE_TYPE = "device"


class DeviceMeta(Meta):
    type: Literal["device"] = Field(
        default=DEVICE_TYPE,
    )


class DeviceCreate(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
    )


class DeviceUpdate(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
    )

    enabled: Optional[bool] = Field(
        default=None,
    )


class DeviceEntity(Entity[DeviceMeta]):
    device_id: UUID = Field(
        ...,
    )

    user_id: UUID = Field(
        ...,
    )

    name: str = Field(
        ...,
    )

    enabled: bool = Field(
        ...,
    )

    created_at: datetime = Field(
        ...,
    )

    last_used_at: Optional[datetime] = Field(
        default=None,
    )


class DeviceIssued(DeviceEntity):
    secret: str = Field(
        ...,
        min_length=1,
    )


DeviceEntities: TypeAlias = Entities[DeviceMeta, DeviceEntity]
