from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Set
from uuid import UUID, uuid4

from api.v1.profile.models import ProfileRuntime
from integrations.postgres import PostgresSession

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


def order_profiles(
    profiles: Iterable[ProfileRuntime],
    now: datetime,
    *,
    weekly_reserve_percent: float,
    score_tolerance: float,
    preferred_profile_id: UUID | None = None,
) -> List[ProfileRuntime]:
    profiles = list(profiles)
    scored = [
        (
            profile_score(
                profile.usage,
                now,
                weekly_reserve_percent=weekly_reserve_percent,
                active_requests=profile.active_requests,
            ),
            profile,
        )
        for profile in profiles
    ]
    scored = [(score, profile) for score, profile in scored if score is not None]
    if not scored and weekly_reserve_percent:
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


async def reserve_profile(
    session: PostgresSession,
    *,
    excluded: Set[UUID],
    weekly_reserve_percent: float,
    score_tolerance: float,
    preferred_profile_id: UUID | None,
    model: str,
) -> Optional[ProfileReservation]:
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
                   created_at,
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
            preferred_profile_id=preferred_profile_id,
        )
        if not ordered:
            return None

        candidate = ordered[0]
        lease_id = uuid4()
        async with session.transaction():
            reserved = await session.fetchrow(
                ProfileRuntime,
                """
                UPDATE profiles
                SET last_used_at=now()
                WHERE profile_id=$1
                  AND last_used_at IS NOT DISTINCT FROM $2
                  AND enabled=true AND auth_status='authorized'
                  AND (cooldown_until IS NULL OR cooldown_until <= now())
                RETURNING profile_id, name, codex_home, enabled, auth_status,
                          usage,
                          jsonb_build_object(
                              'type', 'profile',
                              'href', '/api/v1/profiles/' || profile_id
                          ) AS meta,
                          usage_updated_at, plan_type, plan_updated_at,
                          created_at, updated_at, last_used_at,
                          $3::int AS active_requests
                """,
                candidate.profile_id,
                candidate.last_used_at,
                candidate.active_requests + 1,
            )
            if reserved is None:
                continue
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
