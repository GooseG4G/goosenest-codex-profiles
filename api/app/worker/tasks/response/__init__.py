from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .cleanup import cleanup_response_state

__all__ = ["cleanup_response_state"]


def __getattr__(name: str) -> Any:
    if name == "cleanup_response_state":
        from .cleanup import cleanup_response_state

        return cleanup_response_state

    message = f"module {__name__!r} has no attribute {name!r}"

    raise AttributeError(message)
