from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Set
from uuid import UUID, uuid4

from api.v1.profile.models import ProfileRuntime
from integrations.postgres import PostgresSession
from pydantic import BaseModel

DEFAULT_WINDOW_SECONDS = {
    "primary": 5 * 60 * 60,
    "secondary": 7 * 24 * 60 * 60,
}


@dataclass(frozen=True)
class WindowState:
    used: float
    pace_deficit: float
    remaining: float
    available: bool
    present: bool


@dataclass(frozen=True)
class ProfileReservation:
    profile: ProfileRuntime
    lease_id: UUID


def _number(value: object) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def window_state(
    usage: Optional[Dict[str, Any]],
    name: str,
    now: datetime,
    *,
    reserve_percent: float = 0,
) -> WindowState:
    value = usage.get(name) if isinstance(usage, dict) else None
    present = isinstance(value, dict) and (
        "usedPercent" in value or "resetsAt" in value
    )
    value = value if isinstance(value, dict) else {}
    used = _number(value.get("usedPercent"))
    reset_at = _number(value.get("resetsAt"))
    duration_minutes = _number(value.get("windowDurationMins"))
    duration = (
        duration_minutes * 60
        if duration_minutes is not None and duration_minutes > 0
        else DEFAULT_WINDOW_SECONDS[name]
    )

    now_timestamp = now.timestamp()
    if reset_at is not None and reset_at <= now_timestamp:
        used = 0
        reset_at = now_timestamp + duration
    if used is None:
        used = 0
    used = max(0, min(100, used))

    if reset_at is None or reset_at <= 0:
        elapsed = 0
    else:
        elapsed = max(0, min(1, 1 - ((reset_at - now_timestamp) / duration)))

    spend_limit = 100 - reserve_percent
    remaining = max(0, spend_limit - used)
    pace = elapsed - (used / spend_limit if spend_limit > 0 else 1)
    return WindowState(
        used=used,
        pace_deficit=pace,
        remaining=remaining,
        available=remaining > 0,
        present=present,
    )


def profile_score(
    usage: Optional[Dict[str, Any]],
    now: datetime,
    *,
    weekly_reserve_percent: float,
    active_requests: int = 0,
) -> Optional[float]:
    primary = window_state(usage, "primary", now)
    secondary = window_state(
        usage,
        "secondary",
        now,
        reserve_percent=weekly_reserve_percent,
    )
    if not primary.available or (secondary.present and not secondary.available):
        return None

    # Both limits are consumed by every request. Weekly pace is the long-term
    # constraint; the five-hour pace adds deadline pressure without allowing a
    # nearly exhausted short window to dominate selection.
    active_penalty = active_requests * 0.03
    if not secondary.present:
        return (
            0.95 * primary.pace_deficit
            + 0.05 * (primary.remaining / 100)
            - active_penalty
        )
    headroom = min(primary.remaining / 100, secondary.remaining / 100)
    return (
        0.35 * primary.pace_deficit
        + 0.65 * secondary.pace_deficit
        + 0.02 * headroom
        - active_penalty
    )


def drain_tier(expires_at: Optional[datetime], now: datetime) -> int:
    if expires_at is None:
        return 0
    remaining = expires_at - now
    if remaining <= timedelta(0):
        return -1
    if remaining <= timedelta(days=1):
        return 3
    if remaining <= timedelta(days=3):
        return 2
    if remaining <= timedelta(days=7):
        return 1
    return 0


def reserve_for_tier(tier: int, default: float) -> float:
    return {3: 0.0, 2: 5.0, 1: 15.0}.get(tier, default)


def order_profiles(
    profiles: Iterable[ProfileRuntime],
    now: datetime,
    *,
    weekly_reserve_percent: float,
    score_tolerance: float,
    preferred_profile_id: UUID | None = None,
) -> List[ProfileRuntime]:
    profiles = list(profiles)
    tiers = [
        (drain_tier(profile.subscription_expires_at, now), profile)
        for profile in profiles
    ]
    tiers = [(tier, profile) for tier, profile in tiers if tier >= 0]
    if not tiers:
        return []
    highest_tier = max(tier for tier, _ in tiers)
    profiles = [profile for tier, profile in tiers if tier == highest_tier]
    effective_reserve = reserve_for_tier(highest_tier, weekly_reserve_percent)
    scored = [
        (
            profile_score(
                profile.usage,
                now,
                weekly_reserve_percent=effective_reserve,
                active_requests=profile.active_requests,
            ),
            profile,
        )
        for profile in profiles
    ]
    scored = [(score, profile) for score, profile in scored if score is not None]
    if not scored and effective_reserve:
        return order_profiles(
            profiles,
            now,
            weekly_reserve_percent=0,
            score_tolerance=score_tolerance,
            preferred_profile_id=preferred_profile_id,
        )
    if not scored:
        return []

    best = max(score for score, _ in scored)
    old = datetime.min.replace(tzinfo=timezone.utc)
    close = [item for item in scored if item[0] >= best - score_tolerance]
    rest = [item for item in scored if item[0] < best - score_tolerance]
    close.sort(
        key=lambda item: (
            item[1].last_used_at or old,
            -item[0],
            item[1].profile_id,
        )
    )
    rest.sort(
        key=lambda item: (
            -item[0],
            item[1].last_used_at or old,
            item[1].profile_id,
        )
    )
    ordered = [profile for _, profile in close + rest]
    if preferred_profile_id is not None:
        ordered.sort(key=lambda profile: profile.profile_id != preferred_profile_id)
    return ordered


class AffinityRow(BaseModel):
    profile_id: UUID


async def reserve_profile(
    session: PostgresSession,
    *,
    excluded: Set[UUID],
    weekly_reserve_percent: float,
    score_tolerance: float,
    session_key: str,
    model: str,
) -> Optional[ProfileReservation]:
    affinity = await session.fetchrow(
        AffinityRow,
        """SELECT profile_id FROM chat_profile_affinity
        WHERE session_key=$1 AND expires_at > now()""",
        session_key,
    )
    for _ in range(8):
        profiles = await session.fetch(
            ProfileRuntime,
            """
            SELECT profile_id, name, codex_home, enabled, auth_status, usage,
                   jsonb_build_object(
                       'type', 'profile',
                       'href', '/api/v1/profiles/' || profile_id
                   ) AS meta,
                   usage_updated_at, plan_type, plan_updated_at,
                   subscription_expires_at, created_at,
                   updated_at, last_used_at,
                   (SELECT count(*) FROM profile_leases lease
                    WHERE lease.profile_id=profiles.profile_id
                      AND lease.expires_at > now()) AS active_requests
            FROM profiles
            WHERE enabled=true AND auth_status='authorized'
              AND (cooldown_until IS NULL OR cooldown_until <= now())
              AND NOT EXISTS (
                  SELECT 1 FROM profile_model_health model_health
                  WHERE model_health.profile_id=profiles.profile_id
                    AND model_health.model=$2
                    AND model_health.cooldown_until > now()
              )
              AND NOT (profile_id = ANY($1::uuid[]))
            """,
            list(excluded),
            model,
        )
        ordered = order_profiles(
            profiles,
            datetime.now(timezone.utc),
            weekly_reserve_percent=weekly_reserve_percent,
            score_tolerance=score_tolerance,
            preferred_profile_id=affinity.profile_id if affinity else None,
        )
        if not ordered:
            return None

        candidate = ordered[0]
        lease_id = uuid4()
        reserved = await session.fetchrow(
            ProfileRuntime,
            """
            UPDATE profiles
            SET last_used_at=now()
            WHERE profile_id=$1
              AND last_used_at IS NOT DISTINCT FROM $2
              AND enabled=true AND auth_status='authorized'
              AND (cooldown_until IS NULL OR cooldown_until <= now())
            RETURNING profile_id, name, codex_home, enabled, auth_status, usage,
                      jsonb_build_object(
                          'type', 'profile',
                          'href', '/api/v1/profiles/' || profile_id
                      ) AS meta,
                      usage_updated_at, plan_type, plan_updated_at,
                      subscription_expires_at, created_at,
                      updated_at, last_used_at, $3::int AS active_requests
            """,
            candidate.profile_id,
            candidate.last_used_at,
            candidate.active_requests + 1,
        )
        if reserved is not None:
            await session.execute(
                """INSERT INTO profile_leases (lease_id, profile_id, expires_at)
                VALUES ($1, $2, now() + interval '10 minutes')""",
                lease_id,
                candidate.profile_id,
            )
            return ProfileReservation(profile=reserved, lease_id=lease_id)
    return None


async def release_profile(session: PostgresSession, lease_id: UUID) -> None:
    await session.execute("DELETE FROM profile_leases WHERE lease_id=$1", lease_id)


async def clear_affinity(session: PostgresSession, session_key: str) -> None:
    await session.execute(
        "DELETE FROM chat_profile_affinity WHERE session_key=$1", session_key
    )


async def bind_affinity(
    session: PostgresSession,
    session_key: str,
    profile_id: UUID,
    affinity_minutes: int,
) -> None:
    await session.execute(
        """INSERT INTO chat_profile_affinity
            (session_key, profile_id, assigned_at, expires_at)
        VALUES ($1, $2, now(), now() + make_interval(mins => $3))
        ON CONFLICT (session_key) DO UPDATE SET
            profile_id=EXCLUDED.profile_id,
            assigned_at=CASE
                WHEN chat_profile_affinity.profile_id=EXCLUDED.profile_id
                THEN chat_profile_affinity.assigned_at ELSE now() END,
            expires_at=EXCLUDED.expires_at,
            last_failure_at=NULL""",
        session_key,
        profile_id,
        affinity_minutes,
    )
