from uuid import uuid4

import pytest
from api.v1.event import event
from api.v1.session.auth import Principal


class WebSocket:
    cookies = {"session_token": "token"}

    def __init__(self) -> None:
        self.closed_with: int | None = None

    async def close(self, code: int) -> None:
        self.closed_with = code


@pytest.mark.asyncio
async def test_events_reject_missing_session(monkeypatch: pytest.MonkeyPatch) -> None:
    websocket = WebSocket()

    async def no_principal(_: str | None) -> None:
        return None

    monkeypatch.setattr(event, "_principal", no_principal)
    await event.events(websocket)  # type: ignore[arg-type]

    assert websocket.closed_with == 4401


@pytest.mark.asyncio
async def test_events_reject_non_administrator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    websocket = WebSocket()

    async def user(_: str | None) -> Principal:
        return Principal(user_id=uuid4(), username="user@example.com", role="user")

    monkeypatch.setattr(event, "_principal", user)
    await event.events(websocket)  # type: ignore[arg-type]

    assert websocket.closed_with == 4403
