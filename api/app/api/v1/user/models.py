from datetime import datetime
from typing import Literal, Optional, TypeAlias
from uuid import UUID

from api.v1.models import Entities, Entity, Meta
from pydantic import BaseModel, ConfigDict, EmailStr, Field

USER_TYPE = "user"


class UserMeta(Meta):
    type: Literal["user"] = Field(
        default=USER_TYPE,
    )


class UserCreate(BaseModel):
    username: EmailStr = Field(
        ...,
    )

    nickname: str = Field(
        ...,
        min_length=1,
        max_length=255,
    )

    password: str = Field(
        ...,
        min_length=8,
        max_length=1024,
    )

    role: Literal["user", "administrator"] = Field(
        default="user",
    )


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nickname: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
    )

    password: Optional[str] = Field(
        default=None,
        min_length=8,
        max_length=1024,
    )

    role: Optional[Literal["user", "administrator"]] = Field(
        default=None,
    )


class UserEntity(Entity[UserMeta]):
    user_id: UUID = Field(
        ...,
    )

    username: EmailStr = Field(
        ...,
    )

    nickname: str = Field(
        ...,
    )

    role: Literal["user", "administrator"] = Field(
        ...,
    )

    created_at: datetime = Field(
        ...,
    )

    updated_at: datetime = Field(
        ...,
    )


UserEntities: TypeAlias = Entities[UserMeta, UserEntity]
