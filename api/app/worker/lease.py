import asyncio
from datetime import timedelta
from typing import Any

from celery import Task
from integrations.redis import RedisContext
from integrations.redis.providers import get_redis_settings


def task_lease_key(task_name: str, resource_id: str) -> str:
    return f"tasks:lease:{task_name}:{resource_id}"


class Lease:
    def __init__(self, *, lease_ttl: timedelta) -> None:
        self._lease_ttl = lease_ttl

    async def publish(
        self,
        task: Task,
        resource_id: str,
        *,
        args: list[Any],
        task_id: str,
    ) -> str:
        context = RedisContext(get_redis_settings())
        await context.open()
        key = task_lease_key(task.name, resource_id)
        try:
            owner = await context.acquire_lease(
                key,
                task_id,
                ttl_seconds=int(self._lease_ttl.total_seconds()),
            )
            if owner != task_id:
                return owner
            try:
                await asyncio.to_thread(
                    task.apply_async,
                    args=args,
                    task_id=task_id,
                )
            except Exception:
                await context.release_lease(key, task_id)
                raise
            return task_id
        finally:
            await context.close()


async def claim_execution(
    task_name: str,
    resource_id: str,
    task_id: str,
    *,
    lease_ttl: timedelta,
) -> bool:
    context = RedisContext(get_redis_settings())
    await context.open()
    try:
        key = task_lease_key(task_name, resource_id)
        ttl_seconds = int(lease_ttl.total_seconds())
        owner = await context.acquire_lease(key, task_id, ttl_seconds=ttl_seconds)
        if owner != task_id:
            return False
        return await context.renew_lease(key, task_id, ttl_seconds=ttl_seconds)
    finally:
        await context.close()


async def release_execution(task_name: str, resource_id: str, task_id: str) -> None:
    context = RedisContext(get_redis_settings())
    await context.open()
    try:
        await context.release_lease(task_lease_key(task_name, resource_id), task_id)
    finally:
        await context.close()
