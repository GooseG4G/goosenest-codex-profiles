from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
import worker
from worker.tasks.profile import plan as plan_tasks
from worker.tasks.profile.usage import usage as usage_tasks


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("module", "enqueue", "task_name"),
    [
        (
            plan_tasks,
            plan_tasks._schedule_profile_plan_refresh,
            plan_tasks.PLAN_REFRESH_TASK,
        ),
        (
            usage_tasks,
            usage_tasks._schedule_profile_usage_refresh,
            usage_tasks.USAGE_REFRESH_TASK,
        ),
    ],
)
async def test_profile_refresh_uses_configured_celery_app(
    monkeypatch: pytest.MonkeyPatch,
    module: object,
    enqueue: object,
    task_name: str,
) -> None:
    send_task = Mock()
    monkeypatch.setitem(worker.__dict__, "app", SimpleNamespace(send_task=send_task))

    async def enqueue_once(
        _: str,
        __: str,
        task_id: str,
        dispatch: object,
        **___: object,
    ) -> str:
        await dispatch()
        return task_id

    monkeypatch.setattr(module, "enqueue_once", enqueue_once)
    profile_id = uuid4()

    task_id = await enqueue(profile_id)

    send_task.assert_called_once_with(
        task_name,
        args=[str(profile_id)],
        task_id=task_id,
    )
