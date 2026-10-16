from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .refresh import enqueue_profile_usage_refresh, refresh_profile_usage
    from .resets import consume_profile_usage_reset, enqueue_profile_usage_reset

__all__ = [
    "consume_profile_usage_reset",
    "enqueue_profile_usage_refresh",
    "enqueue_profile_usage_reset",
    "refresh_profile_usage",
]


def __getattr__(name: str) -> Any:
    if name in {"enqueue_profile_usage_refresh", "refresh_profile_usage"}:
        from . import refresh

        return getattr(refresh, name)

    if name in {"consume_profile_usage_reset", "enqueue_profile_usage_reset"}:
        from . import resets

        return getattr(resets, name)

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
