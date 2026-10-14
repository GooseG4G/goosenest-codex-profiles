from functools import lru_cache

from app.api.v1.providers import get_api_settings

from .redis import RedisContext
from .settings import RedisSettings


@lru_cache(maxsize=1)
def get_redis_settings() -> RedisSettings:
    settings = get_api_settings()
    return RedisSettings(
        url=settings.redis_url,
        broker_database=settings.redis_broker_database,
        backend_database=settings.redis_backend_database,
    )


@lru_cache(maxsize=1)
def get_redis_context() -> RedisContext:
    return RedisContext(get_redis_settings())
