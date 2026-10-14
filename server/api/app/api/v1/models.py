from typing import Generic, TypeVar

from pydantic import BaseModel, Field

__all__ = ["Entities", "Entity", "EntityT", "Meta", "MetaT"]


class Meta(BaseModel):
    type: str
    href: str
    total: int | None = Field(default=None, ge=0)


MetaT = TypeVar("MetaT", bound=Meta)


class Entity(BaseModel, Generic[MetaT]):
    meta: MetaT


EntityT = TypeVar("EntityT", bound=Entity)


class Entities(Entity[MetaT], Generic[MetaT, EntityT]):
    items: list[EntityT]
