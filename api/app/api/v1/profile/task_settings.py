from datetime import timedelta
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ProfileTaskSettings(BaseSettings):
    model_config = SettingsConfigDict(
        frozen=True,
        populate_by_name=True,
        env_file=".env",
        env_ignore_empty=True,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    max_retries: int = Field(2, alias="PROFILE_TASK_MAX_RETRIES", ge=0)
    min_retry_delay: int = Field(5, alias="PROFILE_TASK_MIN_RETRY_DELAY", gt=0)
    max_retry_delay: int = Field(30, alias="PROFILE_TASK_MAX_RETRY_DELAY", gt=0)
    lease_ttl: timedelta = Field(
        timedelta(hours=6),
        alias="PROFILE_TASK_LEASE_TTL",
        ge=timedelta(minutes=5),
    )


@lru_cache(maxsize=1)
def get_profile_task_settings() -> ProfileTaskSettings:
    return ProfileTaskSettings()
