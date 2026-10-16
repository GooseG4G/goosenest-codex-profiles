from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .cleanup import cleanup_sessions

__all__ = ["cleanup_sessions"]


def __getattr__(name: str) -> Any:
    if name == "cleanup_sessions":
        from .cleanup import cleanup_sessions

        return cleanup_sessions

    message = f"module {__name__!r} has no attribute {name!r}"

    raise AttributeError(message)
