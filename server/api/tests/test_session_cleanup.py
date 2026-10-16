from unittest.mock import AsyncMock, MagicMock

import pytest
from worker.tasks.session import cleanup as tasks


@pytest.mark.asyncio
async def test_cleanup_removes_expired_sessions_in_bounded_batches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = AsyncMock()
    session.execute.side_effect = ["DELETE 1000", "DELETE 1000", "DELETE 25"]
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

    await tasks.cleanup_expired_sessions()

    assert session.execute.await_count == 3
    for call in session.execute.await_args_list:
        assert "expires_at <= now()" in call.args[0]
        assert call.args[1] == 1_000
    assert session.transaction.call_count == 3
    context.close.assert_awaited_once()
