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
        "https://chatgpt.com/backend-api/codex/responses",
        alias="OPENAI_RESPONSES_URL",
    )
    request_timeout: float = Field(300.0, alias="OPENAI_REQUEST_TIMEOUT", gt=0)
    error_cooldown: int = Field(
        60,
        alias="PROFILE_ERROR_COOLDOWN",
        ge=1,
        le=7 * 24 * 60 * 60,
    )
    score_tolerance: float = Field(
        0.05,
        alias="PROFILE_SCORE_TOLERANCE",
        ge=0,
        le=1,
    )
    affinity_ttl_days: int = Field(
        30,
        alias="PROFILE_AFFINITY_TTL_DAYS",
        ge=1,
        le=365,
    )
    max_attempts: int = Field(
        3,
        alias="PROFILE_RESPONSES_MAX_ATTEMPTS",
        ge=1,
        le=10,
    )


@lru_cache(maxsize=1)
def get_responses_settings() -> ResponsesSettings:
    return ResponsesSettings()
