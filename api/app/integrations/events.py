from pydantic import BaseModel

from app.integrations.redis import RedisContext
from app.integrations.redis.providers import get_redis_settings

EVENT_STREAM = "goosenest:events"
EVENT_STREAM_MAX_LENGTH = 10_000


async def publish_event(
    event: BaseModel,
    context: RedisContext | None = None,
) -> str:
    owned_context = context is None
    context = context or RedisContext(get_redis_settings())
    try:
        if not context.is_open:
            await context.open()
        return await context.append_model(
            EVENT_STREAM,
            event,
            max_length=EVENT_STREAM_MAX_LENGTH,
        )
    finally:
        if owned_context:
            await context.close()
