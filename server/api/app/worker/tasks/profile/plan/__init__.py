from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .refresh import enqueue_profile_plan_refresh, refresh_profile_plan

__all__ = ["enqueue_profile_plan_refresh", "refresh_profile_plan"]


def __getattr__(name: str) -> Any:
    if name in {"enqueue_profile_plan_refresh", "refresh_profile_plan"}:
        from . import refresh

        return getattr(refresh, name)

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
