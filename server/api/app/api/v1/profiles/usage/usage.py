from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.api.v1.auth import Principal, require_admin
from app.api.v1.profiles.models import ProfileRead
from app.integrations.postgres import PostgresSession
from app.integrations.postgres.providers import get_postgres_session
from app.worker.providers import (
    enqueue_profile_usage_refresh,
    enqueue_profile_usage_reset,
)

from .models import (
    UsageLimitsRead,
    UsageResetAccepted,
    UsageResetCredit,
    UsageResetsRead,
    UsageWindow,
)

router = APIRouter(prefix="/{profile_id}/usage", tags=["profile usage"])
Session = Annotated[PostgresSession, Depends(get_postgres_session)]
Administrator = Annotated[Principal, Depends(require_admin)]
FIELDS = """profile_id, name, enabled, auth_status, usage, usage_updated_at,
            created_at, updated_at, last_used_at"""


async def _profile(profile_id: UUID, session: PostgresSession) -> ProfileRead:
    profile = await session.fetchrow(
        ProfileRead,
        f"SELECT {FIELDS} FROM profiles WHERE profile_id=$1",
        profile_id,
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not profile.enabled or profile.auth_status != "authorized":
        raise HTTPException(status_code=409, detail="Profile is not available")
    return profile


def _age(profile: ProfileRead) -> float:
    if profile.usage_updated_at is None:
        return float("inf")
    return (datetime.now(timezone.utc) - profile.usage_updated_at).total_seconds()


async def _revalidate_if_due(profile: ProfileRead) -> bool:
    if _age(profile) < 60:
        return False
    await enqueue_profile_usage_refresh(profile.profile_id)
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
) -> UsageLimitsRead:
    profile = await _profile(profile_id, session)
    refreshing = await _revalidate_if_due(profile)
    usage = profile.usage or {}
    return UsageLimitsRead(
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
) -> UsageResetsRead:
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
    return UsageResetsRead(
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
) -> UsageResetAccepted:
    await _profile(profile_id, session)
    key = idempotency_key or str(uuid4())
    task_id = await enqueue_profile_usage_reset(profile_id, reset_id, key)
    return UsageResetAccepted(task_id=task_id, idempotency_key=key)
