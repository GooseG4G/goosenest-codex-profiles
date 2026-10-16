from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .worker import app

__all__ = ["app"]


def __getattr__(name: str) -> Any:
    if name == "app":
        from .worker import app

        return app

    message = f"module {__name__!r} has no attribute {name!r}"

    raise AttributeError(message)
