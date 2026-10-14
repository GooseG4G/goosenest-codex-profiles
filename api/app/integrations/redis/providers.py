from functools import lru_cache

from settings import get_settings

from .redis import RedisContext
from .settings import RedisSettings


@lru_cache(maxsize=1)
def get_redis_settings() -> RedisSettings:
    settings = get_settings()

    redis_settings = RedisSettings(
        host=settings.redis_host,
        port=settings.redis_port,
        username=settings.redis_username,
        password=settings.redis_password,
        broker_database=settings.redis_broker_database,
        backend_database=settings.redis_backend_database,
    )

    return redis_settings


@lru_cache(maxsize=1)
def get_redis_context() -> RedisContext:
    return RedisContext(get_redis_settings())
