from datetime import datetime
from typing import Literal, Optional, TypeAlias
from uuid import UUID

from api.v1.models import Entities, Entity, Meta
from pydantic import BaseModel, ConfigDict, EmailStr, Field

USER_TYPE = "user"


class UserMeta(Meta):
    type: Literal["user"] = Field(
        default=USER_TYPE,
        description="Resource type",
    )


class UserIdentity(BaseModel):
    user_id: UUID = Field(
        ...,
        description="Authenticated user identifier",
    )


class UserCreate(BaseModel):
    username: EmailStr = Field(
        ...,
        description="User email address",
    )

    nickname: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="User display name",
    )

    password: str = Field(
        ...,
        min_length=8,
        max_length=1024,
        description="User password",
    )

    role: Literal["user", "administrator"] = Field(
        default="user",
        description="User authorization role",
    )


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nickname: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        description="Replacement user display name",
    )

    password: Optional[str] = Field(
        default=None,
        min_length=8,
        max_length=1024,
        description="Replacement user password",
    )

    role: Optional[Literal["user", "administrator"]] = Field(
        default=None,
        description="Replacement user authorization role",
    )


class UserEntity(Entity[UserMeta]):
    user_id: UUID = Field(
        ...,
        description="User identifier",
    )

    username: EmailStr = Field(
        ...,
        description="User email address",
    )

    nickname: str = Field(
        ...,
        description="User display name",
    )

    role: Literal["user", "administrator"] = Field(
        ...,
        description="User authorization role",
    )

    created_at: datetime = Field(
        ...,
        description="Time when the user was created",
    )

    updated_at: datetime = Field(
        ...,
        description="Time when the user was last updated",
    )


UserEntities: TypeAlias = Entities[UserMeta, UserEntity]
