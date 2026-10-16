from collections.abc import Awaitable, Callable
from datetime import timedelta

from integrations.redis import RedisContext
from integrations.redis.providers import get_redis_context, get_redis_settings


def task_lease_key(task_name: str, resource_id: str) -> str:
    return f"tasks:singleflight:{task_name}:{resource_id}"


async def enqueue_once(
    task_name: str,
    resource_id: str,
    task_id: str,
    dispatch: Callable[[], Awaitable[None]],
    *,
    lease_ttl: timedelta,
) -> str:
    context = get_redis_context()
    key = task_lease_key(task_name, resource_id)
    owner = await context.acquire_lease(
        key,
        task_id,
        ttl_seconds=int(lease_ttl.total_seconds()),
    )
    if owner != task_id:
        return owner
    try:
        await dispatch()
    except Exception:
        await context.release_lease(key, task_id)
        raise
    return task_id


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


async def release_execution(
    task_name: str,
    resource_id: str,
    task_id: str,
) -> None:
    context = RedisContext(get_redis_settings())
    await context.open()
    try:
        await context.release_lease(
            task_lease_key(task_name, resource_id),
            task_id,
        )
    finally:
        await context.close()
