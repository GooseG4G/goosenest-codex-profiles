from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID, uuid4

from api.v1.profile.models import ProfileEntity
from api.v1.session.auth import Principal, require_admin
from fastapi import APIRouter, Depends, Header, HTTPException, status
from integrations.postgres import PostgresSession
from integrations.postgres.providers import get_postgres_session

from .models import (
    UsageLimitsEntity,
    UsageLimitsMeta,
    UsageResetCredit,
    UsageResetEntity,
    UsageResetMeta,
    UsageResetsEntity,
    UsageResetsMeta,
    UsageWindow,
)

router = APIRouter(prefix="/{profile_id}/usage", tags=["profile usage"])
Session = Annotated[PostgresSession, Depends(get_postgres_session)]
Administrator = Annotated[Principal, Depends(require_admin)]
FIELDS = """jsonb_build_object(
                'type', 'profile',
                'href', '/api/v1/profiles/' || profile_id
            ) AS meta,
            profile_id, name, enabled, auth_status, usage, usage_updated_at,
            created_at, updated_at, last_used_at"""


async def _profile(profile_id: UUID, session: PostgresSession) -> ProfileEntity:
    profile = await session.fetchrow(
        ProfileEntity,
        f"SELECT {FIELDS} FROM profiles WHERE profile_id=$1",
        profile_id,
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not profile.enabled or profile.auth_status != "authorized":
        raise HTTPException(status_code=409, detail="Profile is not available")
    return profile


def _age(profile: ProfileEntity) -> float:
    if profile.usage_updated_at is None:
        return float("inf")
    return (datetime.now(timezone.utc) - profile.usage_updated_at).total_seconds()


async def _revalidate_if_due(profile: ProfileEntity) -> bool:
    if _age(profile) < 60:
        return False
    from worker.tasks.profile.usage.usage import _schedule_profile_usage_refresh

    await _schedule_profile_usage_refresh(profile.profile_id)
    return True


def _window(value: object) -> UsageWindow | None:
    if not isinstance(value, dict):
        return None
    used = value.get("usedPercent")
    if not isinstance(used, (int, float)):
        return None
    duration = value.get("windowDurationMins")
    resets_at = value.get("resetsAt")
    return UsageWindow(
        used_percent=float(used),
        window_duration_minutes=(
            int(duration) if isinstance(duration, (int, float)) else None
        ),
        resets_at=(int(resets_at) if isinstance(resets_at, (int, float)) else None),
    )


@router.get("/limits")
async def read_limits(
    profile_id: UUID,
    _: Administrator,
    session: Session,
) -> UsageLimitsEntity:
    profile = await _profile(profile_id, session)
    refreshing = await _revalidate_if_due(profile)
    usage = profile.usage or {}
    return UsageLimitsEntity(
        meta=UsageLimitsMeta(href=f"/api/v1/profiles/{profile_id}/usage/limits"),
        plan_type=(
            usage["planType"] if isinstance(usage.get("planType"), str) else None
        ),
        primary=_window(usage.get("primary")),
        secondary=_window(usage.get("secondary")),
        updated_at=profile.usage_updated_at,
        stale=_age(profile) > 180,
        refreshing=refreshing,
    )


@router.get("/resets")
async def read_resets(
    profile_id: UUID,
    _: Administrator,
    session: Session,
) -> UsageResetsEntity:
    profile = await _profile(profile_id, session)
    refreshing = await _revalidate_if_due(profile)
    summary = (profile.usage or {}).get("rateLimitResetCredits")
    if not isinstance(summary, dict):
        summary = {}
    raw_credits = summary.get("credits")
    credits = None
    if isinstance(raw_credits, list):
        credits = [
            UsageResetCredit(
                reset_id=str(item["id"]),
                status=item.get("status", "unknown"),
                reset_type=item.get("resetType", "unknown"),
                title=item.get("title"),
                description=item.get("description"),
                granted_at=int(item["grantedAt"]),
                expires_at=(
                    int(item["expiresAt"])
                    if isinstance(item.get("expiresAt"), (int, float))
                    else None
                ),
            )
            for item in raw_credits
            if isinstance(item, dict)
            and item.get("id")
            and isinstance(item.get("grantedAt"), (int, float))
        ]
    return UsageResetsEntity(
        meta=UsageResetsMeta(href=f"/api/v1/profiles/{profile_id}/usage/resets"),
        available_count=int(summary.get("availableCount", 0)),
        credits=credits,
        updated_at=profile.usage_updated_at,
        stale=_age(profile) > 180,
        refreshing=refreshing,
    )


@router.post("/resets/{reset_id}", status_code=status.HTTP_202_ACCEPTED)
async def consume_reset(
    profile_id: UUID,
    reset_id: str,
    _: Administrator,
    session: Session,
    idempotency_key: Annotated[
        str | None,
        Header(alias="Idempotency-Key"),
    ] = None,
) -> UsageResetEntity:
    await _profile(profile_id, session)
    key = idempotency_key or str(uuid4())
    from worker.tasks.profile.usage.resets import _schedule_profile_usage_reset

    task_id = await _schedule_profile_usage_reset(profile_id, reset_id, key)
    return UsageResetEntity(
        meta=UsageResetMeta(
            href=f"/api/v1/profiles/{profile_id}/usage/resets/{reset_id}"
        ),
        task_id=task_id,
        idempotency_key=key,
    )
