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

    max_retries: int = Field(
        default=2,
        alias="PROFILE_TASK_MAX_RETRIES",
        ge=0,
        description="Maximum number of retries for profile tasks",
    )

    min_retry_delay: int = Field(
        default=5,
        alias="PROFILE_TASK_MIN_RETRY_DELAY",
        gt=0,
        description="Initial profile task retry delay in seconds",
    )

    max_retry_delay: int = Field(
        default=30,
        alias="PROFILE_TASK_MAX_RETRY_DELAY",
        gt=0,
        description="Maximum profile task retry delay in seconds",
    )

    lease_ttl: timedelta = Field(
        default=timedelta(hours=6),
        alias="PROFILE_TASK_LEASE_TTL",
        ge=timedelta(minutes=5),
        description="Maximum lifetime of a profile task execution lease",
    )


@lru_cache(maxsize=1)
def get_profile_task_settings() -> ProfileTaskSettings:
    return ProfileTaskSettings()
