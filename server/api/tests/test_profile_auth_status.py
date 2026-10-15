import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from api.v1.profile.auth import status


def test_expiring_authentication_updates_state_and_publishes_event(
    monkeypatch,
) -> None:
    profile_id = uuid4()
    session = SimpleNamespace(execute=AsyncMock())
    publish = AsyncMock()
    monkeypatch.setattr(status, "publish_event", publish)

    asyncio.run(status.expire_profile_authentication(session, profile_id))

    session.execute.assert_awaited_once()
    assert session.execute.await_args.args[1] == profile_id
    publish.assert_awaited_once()
    event = publish.await_args.args[0]
    assert event.profile_id == profile_id
    assert event.auth_status == "expired"
