import asyncio
from uuid import UUID, uuid4

from app.integrations.redis.providers import get_redis_context
from app.worker.tasks.usage import consume_profile_usage_reset, refresh_profile_usage


async def enqueue_profile_usage_refresh(profile_id: UUID) -> str:
    task_id = str(uuid4())
    claimed = await get_redis_context().claim(
        f"profiles:usage:refresh:{profile_id}",
        task_id,
        ttl_seconds=60,
    )
    if not claimed:
        return ""
    result = await asyncio.to_thread(
        refresh_profile_usage.apply_async,
        args=[str(profile_id)],
        task_id=task_id,
    )
    return result.id


async def enqueue_profile_usage_reset(
    profile_id: UUID,
    credit_id: str,
    idempotency_key: str,
) -> str:
    result = await asyncio.to_thread(
        consume_profile_usage_reset.apply_async,
        args=[str(profile_id), credit_id, idempotency_key],
    )
    return result.id
