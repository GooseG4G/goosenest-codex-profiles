from functools import lru_cache

from .redis import RedisContext
from .settings import RedisSettings


@lru_cache(maxsize=1)
def get_redis_settings() -> RedisSettings:
    redis_settings = RedisSettings()

    return redis_settings


@lru_cache(maxsize=1)
def get_redis_context() -> RedisContext:
    return RedisContext(get_redis_settings())
