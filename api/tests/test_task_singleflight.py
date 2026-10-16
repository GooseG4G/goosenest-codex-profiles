from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from worker import singleflight


class LeaseContext:
    def __init__(self) -> None:
        self.owner = ""
        self.release_lease = AsyncMock(side_effect=self._release)

    async def acquire_lease(
        self,
        _key: str,
        owner: str,
        *,
        ttl_seconds: int,
    ) -> str:
        assert ttl_seconds == 600
        if not self.owner:
            self.owner = owner
        return self.owner

    async def _release(self, _key: str, owner: str) -> bool:
        if self.owner != owner:
            return False
        self.owner = ""
        return True


@pytest.mark.asyncio
async def test_enqueue_once_returns_existing_task_for_same_resource(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = LeaseContext()
    dispatch_first = AsyncMock()
    dispatch_second = AsyncMock()
    monkeypatch.setattr(singleflight, "get_redis_context", lambda: context)
    first = await singleflight.enqueue_once(
        "profiles.usage.refresh",
        "profile-1",
        "task-1",
        dispatch_first,
        lease_ttl=timedelta(minutes=10),
    )
    second = await singleflight.enqueue_once(
        "profiles.usage.refresh",
        "profile-1",
        "task-2",
        dispatch_second,
        lease_ttl=timedelta(minutes=10),
    )

    assert first == "task-1"
    assert second == "task-1"
    dispatch_first.assert_awaited_once()
    dispatch_second.assert_not_awaited()


@pytest.mark.asyncio
async def test_enqueue_once_releases_lease_when_publish_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = LeaseContext()
    dispatch = AsyncMock(side_effect=RuntimeError("broker unavailable"))
    monkeypatch.setattr(singleflight, "get_redis_context", lambda: context)
    with pytest.raises(RuntimeError, match="broker unavailable"):
        await singleflight.enqueue_once(
            "profiles.usage.refresh",
            "profile-1",
            "task-1",
            dispatch,
            lease_ttl=timedelta(minutes=10),
        )

    context.release_lease.assert_awaited_once()
    assert context.owner == ""


def test_task_type_is_part_of_lease_identity() -> None:
    usage = singleflight.task_lease_key("profiles.usage.refresh", "profile-1")
    plan = singleflight.task_lease_key("profiles.plan.refresh", "profile-1")

    assert usage != plan
