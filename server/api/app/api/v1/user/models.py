from datetime import datetime
from typing import Literal, TypeAlias
from uuid import UUID

from api.v1.models import Entities, Entity, Meta
from pydantic import BaseModel, EmailStr, Field

USER_TYPE = "user"


class UserMeta(Meta):
    type: Literal["user"] = USER_TYPE


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


class UserEntity(Entity[UserMeta]):
    user_id: UUID
    username: EmailStr
    nickname: str
    role: Literal["user", "administrator"]
    created_at: datetime
    updated_at: datetime


UserEntities: TypeAlias = Entities[UserMeta, UserEntity]
