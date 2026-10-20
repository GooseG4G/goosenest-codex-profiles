import asyncio
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from worker import lease


class LeaseContext:
    def __init__(self) -> None:
        self.owner = ""
        self.release_lease = AsyncMock(side_effect=self._release)

    async def open(self) -> None:
        return None

    async def close(self) -> None:
        return None

    async def acquire_lease(self, _key: str, owner: str, *, ttl_seconds: int) -> str:
        assert ttl_seconds == 600
        await asyncio.sleep(0)
        if not self.owner:
            self.owner = owner
        return self.owner

    async def _release(self, _key: str, owner: str) -> bool:
        if self.owner != owner:
            return False
        self.owner = ""
        return True


@pytest.mark.asyncio
async def test_lease_returns_existing_owner_for_same_resource(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = LeaseContext()
    monkeypatch.setattr(lease, "RedisContext", lambda _settings: context)
    monkeypatch.setattr(lease, "get_redis_settings", lambda: object())
    first_task = SimpleNamespace(name="profiles.usage.refresh", apply_async=Mock())
    second_task = SimpleNamespace(name="profiles.usage.refresh", apply_async=Mock())
    task_lock = lease.Lease(lease_ttl=timedelta(minutes=10))

    first = await task_lock.publish(
        first_task,
        "profile-1",
        args=["profile-1"],
        task_id="task-1",
    )
    second = await task_lock.publish(
        second_task,
        "profile-1",
        args=["profile-1"],
        task_id="task-2",
    )

    assert first == "task-1"
    assert second == "task-1"
    first_task.apply_async.assert_called_once_with(args=["profile-1"], task_id="task-1")
    second_task.apply_async.assert_not_called()


@pytest.mark.asyncio
async def test_lease_releases_lock_when_publish_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = LeaseContext()
    monkeypatch.setattr(lease, "RedisContext", lambda _settings: context)
    monkeypatch.setattr(lease, "get_redis_settings", lambda: object())
    task = SimpleNamespace(
        name="profiles.usage.refresh",
        apply_async=Mock(side_effect=RuntimeError("broker unavailable")),
    )
    task_lock = lease.Lease(lease_ttl=timedelta(minutes=10))

    with pytest.raises(RuntimeError, match="broker unavailable"):
        await task_lock.publish(task, "profile-1", args=["profile-1"], task_id="task-1")

    context.release_lease.assert_awaited_once()
    assert context.owner == ""


@pytest.mark.asyncio
async def test_lease_publishes_only_once_under_concurrency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = LeaseContext()
    monkeypatch.setattr(lease, "RedisContext", lambda _settings: context)
    monkeypatch.setattr(lease, "get_redis_settings", lambda: object())
    tasks = [
        SimpleNamespace(
            name="profiles.usage.refresh",
            apply_async=Mock(),
        )
        for _ in range(2)
    ]
    task_lock = lease.Lease(lease_ttl=timedelta(minutes=10))

    results = await asyncio.gather(
        *(
            task_lock.publish(
                task,
                "profile-1",
                args=["profile-1"],
                task_id=f"task-{index}",
            )
            for index, task in enumerate(tasks)
        )
    )

    assert sorted(results) == ["task-0", "task-0"]
    assert sum(task.apply_async.call_count for task in tasks) == 1


def test_task_type_is_part_of_lease_identity() -> None:
    usage = lease.task_lease_key("profiles.usage.refresh", "profile-1")
    plan = lease.task_lease_key("profiles.usage.refresh", "profile-1")

    assert usage != plan
