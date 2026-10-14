from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class UsageTaskSettings(BaseSettings):
    model_config = SettingsConfigDict(
        frozen=True,
        populate_by_name=True,
        env_file=".env",
        env_ignore_empty=True,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    max_retries: int = Field(2, alias="USAGE_TASK_MAX_RETRIES", ge=0)
    min_retry_delay: int = Field(5, alias="USAGE_TASK_MIN_RETRY_DELAY", gt=0)
    max_retry_delay: int = Field(30, alias="USAGE_TASK_MAX_RETRY_DELAY", gt=0)


@lru_cache(maxsize=1)
def get_usage_task_settings() -> UsageTaskSettings:
    task_settings = UsageTaskSettings()

    return task_settings
