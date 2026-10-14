from datetime import datetime
from typing import Literal, TypeAlias
from uuid import UUID

from api.v1.models import Entities, Entity, Meta
from pydantic import BaseModel, Field

DEVICE_TYPE = "device"


class DeviceMeta(Meta):
    type: Literal["device"] = DEVICE_TYPE


class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class DeviceUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    enabled: bool | None = None


class DeviceEntity(Entity[DeviceMeta]):
    device_id: UUID
    user_id: UUID
    name: str
    enabled: bool
    created_at: datetime
    last_used_at: datetime | None = None


class DeviceIssued(DeviceEntity):
    secret: str


DeviceEntities: TypeAlias = Entities[DeviceMeta, DeviceEntity]
