from uuid import uuid4

import pytest
from api.v1.event import event
from api.v1.event.access import can_receive_event
from api.v1.event.models import EventAudience, ProfileUsageUpdated
from api.v1.session.auth import Principal


class WebSocket:
    cookies = {"session_token": "token"}
    headers: dict[str, str] = {}

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
async def test_events_reject_cross_origin_cookie_session() -> None:
    websocket = WebSocket()
    websocket.headers = {
        "origin": "https://attacker.example",
        "host": "codex.goosenest.ru",
    }

    await event.events(websocket)  # type: ignore[arg-type]

    assert websocket.closed_with == 4403


def test_default_events_are_visible_to_administrators_only() -> None:
    event = ProfileUsageUpdated(profile_id=uuid4())
    administrator = Principal(
        user_id=uuid4(), username="admin@example.com", role="administrator"
    )
    user = Principal(user_id=uuid4(), username="user@example.com", role="user")

    assert can_receive_event(administrator, event)
    assert not can_receive_event(user, event)


def test_event_can_target_a_user_and_administrators() -> None:
    user_id = uuid4()
    event = ProfileUsageUpdated(
        profile_id=uuid4(),
        audience=EventAudience(
            roles=frozenset({"administrator"}),
            user_ids=frozenset({user_id}),
        ),
    )
    administrator = Principal(
        user_id=uuid4(), username="admin@example.com", role="administrator"
    )
    target = Principal(user_id=user_id, username="target@example.com", role="user")
    other = Principal(user_id=uuid4(), username="other@example.com", role="user")

    assert can_receive_event(administrator, event)
    assert can_receive_event(target, event)
    assert not can_receive_event(other, event)
