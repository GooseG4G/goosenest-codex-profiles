from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from api.v1.profile.models import ProfileMeta, ProfileRuntime
from api.v1.response.scheduler import (
    order_profiles,
    profile_score,
    window_state,
)

NOW = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)


def usage(primary_used: float, weekly_used: float, *, reset_hours: int = 1) -> dict:
    return {
        "primary": {
            "usedPercent": primary_used,
            "windowDurationMins": 300,
            "resetsAt": int((NOW + timedelta(hours=reset_hours)).timestamp()),
        },
        "secondary": {
            "usedPercent": weekly_used,
            "windowDurationMins": 10_080,
            "resetsAt": int((NOW + timedelta(days=1)).timestamp()),
        },
    }


def profile(
    name: str,
    limits: dict,
    last_used_at: datetime | None,
    *,
    active_requests: int = 0,
    profile_id: UUID | None = None,
) -> ProfileRuntime:
    return ProfileRuntime(
        meta=ProfileMeta(href=f"/api/v1/profiles/{name}"),
        profile_id=profile_id or uuid4(),
        name=name,
        codex_home=f"/profiles/{name}",
        enabled=True,
        auth_status="authorized",
        usage=limits,
        usage_updated_at=NOW,
        created_at=NOW,
        updated_at=NOW,
        last_used_at=last_used_at,
        active_requests=active_requests,
    )


def test_expired_window_is_treated_as_restored() -> None:
    limits = usage(100, 10)
    limits["primary"]["resetsAt"] = int((NOW - timedelta(seconds=1)).timestamp())

    state = window_state(limits, "primary", NOW)

    assert state.used == 0
    assert state.available


def test_weekly_reserve_removes_profile_from_normal_pool() -> None:
    assert profile_score(usage(20, 75), NOW, weekly_reserve_percent=25) is None


def test_profile_behind_consumption_pace_scores_higher() -> None:
    underused = profile_score(usage(10, 20), NOW, weekly_reserve_percent=0)
    overused = profile_score(usage(80, 80), NOW, weekly_reserve_percent=0)

    assert underused is not None
    assert overused is not None
    assert underused > overused


def test_oldest_profile_wins_when_scores_are_close() -> None:
    old = profile("old", usage(20, 20), NOW - timedelta(hours=2))
    recent = profile("recent", usage(19, 19), NOW - timedelta(minutes=1))

    ordered = order_profiles(
        [recent, old],
        NOW,
        weekly_reserve_percent=25,
        score_tolerance=0.05,
    )

    assert ordered[0].name == "old"


def test_weekly_reserve_is_released_when_every_profile_reaches_it() -> None:
    first = profile("first", usage(20, 80), NOW - timedelta(hours=2))
    second = profile("second", usage(30, 85), NOW - timedelta(hours=1))

    ordered = order_profiles(
        [first, second],
        NOW,
        weekly_reserve_percent=25,
        score_tolerance=0.05,
    )

    assert [item.name for item in ordered] == ["first", "second"]


def test_missing_weekly_window_is_not_blocked_by_weekly_reserve() -> None:
    limits = usage(20, 20)
    del limits["secondary"]

    assert profile_score(limits, NOW, weekly_reserve_percent=25) is not None


def test_active_request_penalizes_otherwise_equal_profile() -> None:
    idle = profile("idle", usage(20, 20), NOW, active_requests=0)
    busy = profile("busy", usage(20, 20), NOW, active_requests=2)

    ordered = order_profiles(
        [busy, idle], NOW, weekly_reserve_percent=25, score_tolerance=0.01
    )

    assert ordered[0].name == "idle"


def test_profile_id_stabilizes_exact_tie() -> None:
    high_id = profile(
        "high",
        usage(20, 20),
        NOW,
        profile_id=UUID("ffffffff-ffff-ffff-ffff-ffffffffffff"),
    )
    low_id = profile(
        "low",
        usage(20, 20),
        NOW,
        profile_id=UUID("00000000-0000-0000-0000-000000000001"),
    )

    ordered = order_profiles(
        [high_id, low_id], NOW, weekly_reserve_percent=25, score_tolerance=0.05
    )

    assert [item.name for item in ordered] == ["low", "high"]


def test_chat_affinity_keeps_an_eligible_profile_selected() -> None:
    preferred = profile("preferred", usage(22, 22), NOW)
    other = profile("other", usage(20, 20), NOW - timedelta(hours=1))

    ordered = order_profiles(
        [other, preferred],
        NOW,
        weekly_reserve_percent=25,
        score_tolerance=0.05,
        preferred_profile_id=preferred.profile_id,
    )

    assert ordered[0].profile_id == preferred.profile_id
