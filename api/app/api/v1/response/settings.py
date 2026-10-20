from datetime import timedelta
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ResponsesSettings(BaseSettings):
    model_config = SettingsConfigDict(
        frozen=True,
        populate_by_name=True,
        env_file=".env",
        env_ignore_empty=True,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    url: str = Field(
        default="https://chatgpt.com/backend-api/codex/responses",
        alias="OPENAI_RESPONSES_URL",
        description="Upstream Codex responses endpoint",
    )

    request_timeout: float = Field(
        default=300.0,
        alias="OPENAI_REQUEST_TIMEOUT",
        gt=0,
        description="Upstream response timeout in seconds",
    )

    error_cooldown: timedelta = Field(
        default=timedelta(seconds=60),
        alias="PROFILE_ERROR_COOLDOWN",
        description="Cooldown applied after an upstream profile error",
    )

    score_tolerance: float = Field(
        default=0.05,
        alias="PROFILE_SCORE_TOLERANCE",
        ge=0,
        le=1,
        description="Tolerance used when comparing profile scores",
    )

    affinity_ttl_days: int = Field(
        default=30,
        alias="PROFILE_AFFINITY_TTL_DAYS",
        ge=1,
        le=365,
        description="Conversation-to-profile affinity lifetime in days",
    )

    max_attempts: int = Field(
        default=3,
        alias="PROFILE_RESPONSES_MAX_ATTEMPTS",
        ge=1,
        le=10,
        description="Maximum upstream attempts for a response request",
    )
    capacity_max_retries: int = Field(
        3,
        alias="PROFILE_CAPACITY_MAX_RETRIES",
        ge=0,
        le=10,
    )
    capacity_retry_min_delay: timedelta = Field(
        timedelta(seconds=1),
        alias="PROFILE_CAPACITY_RETRY_MIN_DELAY",
    )
    capacity_retry_max_delay: timedelta = Field(
        timedelta(seconds=30),
        alias="PROFILE_CAPACITY_RETRY_MAX_DELAY",
    )


@lru_cache(maxsize=1)
def get_responses_settings() -> ResponsesSettings:
    return ResponsesSettings()
