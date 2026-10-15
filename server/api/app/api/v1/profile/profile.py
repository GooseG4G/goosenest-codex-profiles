from pathlib import Path
from typing import Annotated
from uuid import UUID

from api.v1.session.auth import Principal, require_admin
from asyncpg import UniqueViolationError
from fastapi import APIRouter, Depends, HTTPException, Response, status
from integrations.codex.providers import get_codex_settings
from integrations.postgres import PostgresSession
from integrations.postgres.providers import get_postgres_session

from .models import (
    ProfileEntities,
    ProfileEntity,
    ProfileMeta,
    ProfileRuntime,
    ProfileUpdate,
)
from .usage.usage import router as usage_router

router = APIRouter(prefix="/profiles", tags=["profiles"])
router.include_router(usage_router)
Session = Annotated[PostgresSession, Depends(get_postgres_session)]
Administrator = Annotated[Principal, Depends(require_admin)]
FIELDS = """jsonb_build_object(
                'type', 'profile',
                'href', '/api/v1/profiles/' || profile_id
            ) AS meta,
            profile_id, name, enabled, auth_status, usage, usage_updated_at,
            subscription_expires_at, created_at, updated_at, last_used_at"""


@router.get("")
async def read_profiles(_: Administrator, session: Session) -> ProfileEntities:
    items = await session.fetch(
        ProfileEntity, f"SELECT {FIELDS} FROM profiles ORDER BY created_at"
    )
    return ProfileEntities(
        meta=ProfileMeta(href="/api/v1/profiles", total=len(items)),
        items=items,
    )


@router.get("/{profile_id}")
async def read_profile(
    profile_id: UUID, _: Administrator, session: Session
) -> ProfileEntity:
    profile = await session.fetchrow(
        ProfileEntity,
        f"SELECT {FIELDS} FROM profiles WHERE profile_id=$1",
        profile_id,
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.patch("/{profile_id}")
async def update_profile(
    profile_id: UUID, body: ProfileUpdate, _: Administrator, session: Session
) -> ProfileEntity:
    try:
        profile = await session.fetchrow(
            ProfileEntity,
            f"""UPDATE profiles
            SET name=COALESCE($2,name), enabled=COALESCE($3,enabled),
                subscription_expires_at=COALESCE($4,subscription_expires_at),
                updated_at=now()
            WHERE profile_id=$1
            RETURNING {FIELDS}""",
            profile_id,
            body.name,
            body.enabled,
            body.subscription_expires_at,
        )
    except UniqueViolationError as error:
        raise HTTPException(
            status_code=409, detail="Profile email already exists"
        ) from error
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    profile_id: UUID, _: Administrator, session: Session
) -> Response:
    profile = await session.fetchrow(
        ProfileRuntime,
        f"DELETE FROM profiles WHERE profile_id=$1 RETURNING {FIELDS}, codex_home",
        profile_id,
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    # Credentials are removed only after the exact DB-owned profile path is resolved.
    home = Path(profile.codex_home).resolve()
    root = Path(get_codex_settings().profiles_root).resolve()
    try:
        home.relative_to(root)
    except ValueError as error:
        raise HTTPException(
            status_code=500, detail="Invalid profile storage path"
        ) from error
    if home.is_dir():
        import shutil

        shutil.rmtree(home)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
