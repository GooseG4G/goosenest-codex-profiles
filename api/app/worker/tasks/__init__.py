from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .profile import (
        consume_profile_usage_reset,
        refresh_profile_usage,
    )
    from .response import cleanup_response_state
    from .session import cleanup_sessions

__all__ = [
    "consume_profile_usage_reset",
    "refresh_profile_usage",
    "cleanup_response_state",
    "cleanup_sessions",
]


def __getattr__(name: str) -> Any:
    if name == "consume_profile_usage_reset":
        from .profile import consume_profile_usage_reset

        return consume_profile_usage_reset

    if name == "refresh_profile_usage":
        from .profile import refresh_profile_usage

        return refresh_profile_usage

    if name == "cleanup_response_state":
        from .response import cleanup_response_state

        return cleanup_response_state

    if name == "cleanup_sessions":
        from .session import cleanup_sessions

        return cleanup_sessions

    message = f"module {__name__!r} has no attribute {name!r}"

    raise AttributeError(message)
