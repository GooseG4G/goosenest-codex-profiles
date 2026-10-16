from uuid import UUID

from pydantic import BaseModel


class DeviceIdentity(BaseModel):
    device_id: UUID
    user_id: UUID
