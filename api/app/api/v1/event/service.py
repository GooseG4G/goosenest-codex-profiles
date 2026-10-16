from integrations.redis import RedisContext
from integrations.redis.providers import get_redis_context

from .models import Event

EVENT_STREAM = "goosenest:events"
EVENT_STREAM_MAX_LENGTH = 10_000
EVENT_PRODUCER = "goosenest-api"


async def publish_event(
    event: Event,
    *,
    context: RedisContext | None = None,
) -> str:
    redis = context or get_redis_context()
    owned_context = not redis.is_open
    if owned_context:
        await redis.open()
    try:
        return await redis.append_model(
            EVENT_STREAM,
            event,
            max_length=EVENT_STREAM_MAX_LENGTH,
            producer_id=EVENT_PRODUCER,
            idempotency_id=str(event.event_id),
        )
    finally:
        if owned_context:
            await redis.close()
