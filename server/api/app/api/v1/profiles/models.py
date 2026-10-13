from typing import Optional, TypeAlias
from uuid import UUID

from ..models import Entities, Entity, Meta
from .types import PROFILE_TYPE, ProfileType


class ProfileMeta(Meta[None]):
    type: ProfileType = PROFILE_TYPE


class ProfileEntity(Entity[ProfileMeta]):
    profile_id: Optional[UUID] = None
    name: Optional[str] = None


ProfileEntities: TypeAlias = Entities[
    ProfileMeta,
    ProfileEntity,
]
