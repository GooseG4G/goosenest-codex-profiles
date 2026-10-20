from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, Field

__all__ = ["Entities", "Entity", "EntityT", "Meta", "MetaT"]


class Meta(BaseModel):
    type: str = Field(
        ...,
        description="Resource type",
    )

    href: str = Field(
        ...,
        description="Canonical API resource path",
    )

    total: Optional[int] = Field(
        default=None,
        ge=0,
        description="Total number of resources in a collection",
    )


MetaT = TypeVar("MetaT", bound=Meta)


class Entity(BaseModel, Generic[MetaT]):
    meta: MetaT = Field(
        ...,
        description="Resource metadata",
    )


EntityT = TypeVar("EntityT", bound=Entity)


class Entities(Entity[MetaT], Generic[MetaT, EntityT]):
    items: list[EntityT] = Field(
        ...,
        description="Resources in the collection",
    )
