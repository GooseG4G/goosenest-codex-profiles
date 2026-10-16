from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from api.v1.profile.models import ProfileEntity
from api.v1.session.auth import Principal, require_admin
from fastapi import APIRouter, Depends, HTTPException
from integrations.postgres import PostgresSession
from integrations.postgres.providers import get_postgres_session
from pydantic import BaseModel

from .tasks import enqueue_profile_plan_refresh

router = APIRouter(prefix="/{profile_id}/plan", tags=["profile plan"])
Session = Annotated[PostgresSession, Depends(get_postgres_session)]
Administrator = Annotated[Principal, Depends(require_admin)]


class ProfilePlan(BaseModel):
    plan_type: str | None = None
    updated_at: datetime | None = None
    stale: bool = True
    refreshing: bool = False


@router.get("")
async def read_plan(
    profile_id: UUID, _: Administrator, session: Session
) -> ProfilePlan:
    profile = await session.fetchrow(
        ProfileEntity,
        """SELECT jsonb_build_object(
                   'type', 'profile',
                   'href', '/api/v1/profiles/' || profile_id
               ) AS meta,
               profile_id, name, enabled, auth_status, usage, usage_updated_at,
               plan_type, plan_updated_at,
               created_at, updated_at, last_used_at
           FROM profiles WHERE profile_id=$1""",
        profile_id,
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    age = (
        float("inf")
        if profile.plan_updated_at is None
        else (datetime.now(timezone.utc) - profile.plan_updated_at).total_seconds()
    )
    refreshing = age >= 60
    if refreshing and profile.enabled and profile.auth_status == "authorized":
        await enqueue_profile_plan_refresh(profile_id)
    return ProfilePlan(
        plan_type=profile.plan_type,
        updated_at=profile.plan_updated_at,
        stale=age > 180,
        refreshing=refreshing,
    )
