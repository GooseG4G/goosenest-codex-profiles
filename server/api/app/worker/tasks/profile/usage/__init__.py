from __future__ import annotations
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .resets import consume_profile_usage_reset
    from .usage import refresh_profile_usage

__all__ = [
    "refresh_profile_usage",
    "consume_profile_usage_reset",
]


def __getattr__(name: str) -> Any:
    if name == "refresh_profile_usage":
        from .usage import refresh_profile_usage

        return refresh_profile_usage

    if name == "consume_profile_usage_reset":
        from .resets import consume_profile_usage_reset

        return consume_profile_usage_reset

    message = f"module {__name__!r} has no attribute {name!r}"

    raise AttributeError(message)
