from functools import lru_cache

from .settings import ApiSettings


@lru_cache(maxsize=1)
def get_api_settings() -> ApiSettings:
    return ApiSettings()
