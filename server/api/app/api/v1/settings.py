from functools import lru_cache

from pydantic import EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ApiSettings(BaseSettings):
    model_config = SettingsConfigDict(
        frozen=True,
        populate_by_name=True,
        env_file=".env",
        env_ignore_empty=True,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    bootstrap_username: EmailStr | None = Field(
        None,
        alias="BOOTSTARTUP_USERNAME",
    )
    bootstrap_nickname: str | None = Field(
        None,
        alias="BOOTSTARTUP_NICKNAME",
    )
    bootstrap_password: str | None = Field(
        None,
        alias="BOOTSTARTUP_PASSWORD",
    )

    responses_url: str = Field(
        "https://chatgpt.com/backend-api/codex/responses",
        alias="OPENAI_RESPONSES_URL",
    )
    request_timeout: float = Field(
        300.0,
        alias="OPENAI_REQUEST_TIMEOUT",
        gt=0,
    )
    profile_weekly_reserve_percent: float = Field(
        25.0,
        alias="PROFILE_WEEKLY_RESERVE_PERCENT",
        ge=0,
        lt=100,
    )
    profile_score_tolerance: float = Field(
        0.05,
        alias="PROFILE_SCORE_TOLERANCE",
        ge=0,
        le=1,
    )
    profile_affinity_minutes: int = Field(
        20,
        alias="PROFILE_AFFINITY_MINUTES",
        ge=1,
        le=1440,
    )
    profile_max_attempts: int = Field(
        3,
        alias="PROFILE_MAX_ATTEMPTS",
        ge=1,
        le=10,
    )

    session_ttl_days: int = Field(30, alias="SESSION_TTL_DAYS", ge=1)
    session_cookie_secure: bool = Field(False, alias="SESSION_COOKIE_SECURE")


@lru_cache(maxsize=1)
def get_api_settings() -> ApiSettings:
    api_settings = ApiSettings()

    return api_settings
