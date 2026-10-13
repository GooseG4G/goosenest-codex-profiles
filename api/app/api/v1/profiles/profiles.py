from uuid import UUID

from fastapi import APIRouter

from .models import (
    ProfileEntities,
    ProfileEntity,
)

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("")
async def read_profiles() -> ProfileEntities:
    return ProfileEntities(items=[])


@router.post("")
async def create_profile(profile: ProfileEntity) -> ProfileEntity:
    return ProfileEntity(name=profile.name)


@router.get("/{profile_id}")
async def read_profile(profile_id: UUID) -> ProfileEntity:
    return ProfileEntity(profile_id=profile_id)


@router.patch("/{profile_id}")
async def update_profile(profile_id: UUID, profile: ProfileEntity) -> ProfileEntity:
    return ProfileEntity(profile_id=profile_id, name=profile.name)


@router.put("/{profile_id}")
async def replace_profile(profile_id: UUID, profile: ProfileEntity) -> ProfileEntity:
    return ProfileEntity(profile_id=profile_id, name=profile.name)


@router.delete("/{profile_id}")
async def delete_profile(profile_id: UUID) -> ProfileEntity:
    return ProfileEntity(profile_id=profile_id)
