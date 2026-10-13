from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel

__all__ = [
    "Meta",
    "MetaT",
    "Entity",
    "EntityT",
    "Entities",
]

QueryT = TypeVar("QueryT")


class Meta(BaseModel, Generic[QueryT]):
    type: str
    href: str
    total: Optional[int] = None
    query: Optional[QueryT] = None


MetaT = TypeVar("MetaT", bound=Meta)


class Entity(BaseModel, Generic[MetaT]):
    meta: Optional[MetaT] = None


EntityT = TypeVar("EntityT", bound=Entity)


class Entities(Entity[MetaT], Generic[MetaT, EntityT]):
    items: Optional[List[EntityT]] = None
