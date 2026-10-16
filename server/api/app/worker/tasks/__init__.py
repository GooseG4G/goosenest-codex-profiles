from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .profile import (
        consume_profile_usage_reset,
        enqueue_profile_plan_refresh,
        enqueue_profile_usage_refresh,
        enqueue_profile_usage_reset,
        refresh_profile_plan,
        refresh_profile_usage,
    )
    from .response import cleanup_response_state
    from .session import cleanup_sessions

__all__ = [
    "cleanup_response_state",
    "cleanup_sessions",
    "consume_profile_usage_reset",
    "enqueue_profile_plan_refresh",
    "enqueue_profile_usage_refresh",
    "enqueue_profile_usage_reset",
    "refresh_profile_plan",
    "refresh_profile_usage",
]


def __getattr__(name: str) -> Any:
    if name in {
        "consume_profile_usage_reset",
        "enqueue_profile_plan_refresh",
        "enqueue_profile_usage_refresh",
        "enqueue_profile_usage_reset",
        "refresh_profile_plan",
        "refresh_profile_usage",
    }:
        from . import profile

        return getattr(profile, name)

    if name == "cleanup_response_state":
        from .response import cleanup_response_state

        return cleanup_response_state

    if name == "cleanup_sessions":
        from .session import cleanup_sessions

        return cleanup_sessions

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
