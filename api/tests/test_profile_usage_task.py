import pytest

from worker.tasks.profile.usage import usage as task


@pytest.mark.asyncio
async def test_usage_task_prefers_direct_http(monkeypatch) -> None:
    expected = {
        "primary": {
            "usedPercent": 12,
            "windowDurationMins": 300,
            "resetsAt": None,
        }
    }

    async def direct(_: str) -> dict:
        return expected

    monkeypatch.setattr(task, "read_codex_usage", direct)

    result = await task._read_usage("profile-home")

    assert result == expected


