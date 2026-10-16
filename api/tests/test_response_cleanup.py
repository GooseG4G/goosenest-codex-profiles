from unittest.mock import AsyncMock, MagicMock

import pytest
from worker.tasks.response import cleanup as tasks


@pytest.mark.asyncio
async def test_cleanup_removes_expired_state_in_bounded_batches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = AsyncMock()
    session.execute.side_effect = [
        "DELETE 1000",
        "DELETE 20",
        "DELETE 1000",
        "DELETE 1000",
        "DELETE 0",
    ]
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
    monkeypatch.setattr(tasks, "get_postgres_settings", lambda: object())

    await tasks.cleanup_expired_response_state()

    assert session.execute.await_count == 5
    for call in session.execute.await_args_list:
        assert "expires_at <= now()" in call.args[0]
        assert call.args[1] == 1_000
    assert session.transaction.call_count == 5
    context.close.assert_awaited_once()
