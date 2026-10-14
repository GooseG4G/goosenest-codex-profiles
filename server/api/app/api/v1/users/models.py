from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    username: EmailStr
    nickname: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=1024)
    role: Literal["user", "administrator"] = "user"


class UserUpdate(BaseModel):
    username: EmailStr | None = None
    nickname: str | None = Field(None, min_length=1, max_length=255)
    password: str | None = Field(None, min_length=8, max_length=1024)
    role: Literal["user", "administrator"] | None = None


class UserRead(BaseModel):
    user_id: UUID
    username: EmailStr
    nickname: str
    role: Literal["user", "administrator"]
    created_at: datetime
    updated_at: datetime


class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class DeviceUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    enabled: bool | None = None


class DeviceRead(BaseModel):
    device_id: UUID
    user_id: UUID
    name: str
    enabled: bool
    created_at: datetime
    last_used_at: datetime | None = None


class DeviceIssued(DeviceRead):
    secret: str
