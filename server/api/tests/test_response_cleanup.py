from unittest.mock import AsyncMock, MagicMock

import pytest
from api.v1.response import tasks


@pytest.mark.asyncio
async def test_cleanup_removes_expired_state_in_bounded_batches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = AsyncMock()
    transaction = AsyncMock()
    transaction.__aenter__.return_value = session
    transaction.__aexit__.return_value = None
    session.transaction = MagicMock(return_value=transaction)
    acquired = AsyncMock()
    acquired.__aenter__.return_value = session
    acquired.__aexit__.return_value = None
    context = AsyncMock()
    context.acquire = MagicMock(return_value=acquired)
    monkeypatch.setattr(tasks, "PostgresContext", lambda _settings: context)

    await tasks.cleanup_expired_response_state()

    assert session.execute.await_count == 2
    for call in session.execute.await_args_list:
        assert "expires_at <= now()" in call.args[0]
        assert call.args[1] == tasks.CLEANUP_BATCH_SIZE
    context.close.assert_awaited_once()
