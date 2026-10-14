from typing import Optional

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

    postgres_host: str = Field("postgres", alias="POSTGRES_HOST")
    postgres_port: int = Field(5432, alias="POSTGRES_PORT")
    postgres_database: str = Field(..., alias="POSTGRES_DATABASE")
    postgres_username: str = Field(..., alias="POSTGRES_USERNAME")
    postgres_password: str = Field(..., alias="POSTGRES_PASSWORD")
    redis_url: str = Field("redis://redis:6379", alias="REDIS_URL")
    redis_broker_database: int = Field(0, alias="REDIS_BROKER_DATABASE", ge=0)
    redis_backend_database: int = Field(1, alias="REDIS_BACKEND_DATABASE", ge=0)

    api_bootstartup_username: Optional[EmailStr] = Field(
        None,
        alias="BOOTSTARTUP_USERNAME",
    )
    api_bootstartup_nickname: Optional[str] = Field(
        None,
        alias="BOOTSTARTUP_NICKNAME",
    )
    api_bootstartup_password: Optional[str] = Field(
        None,
        alias="BOOTSTARTUP_PASSWORD",
    )

    openai_responses_url: str = Field(
        "https://chatgpt.com/backend-api/codex/responses",
        alias="OPENAI_RESPONSES_URL",
    )
    openai_request_timeout: float = Field(
        300.0,
        alias="OPENAI_REQUEST_TIMEOUT",
        gt=0,
    )
    codex_executable: str = Field("codex", alias="CODEX_EXECUTABLE")
    codex_profiles_root: str = Field(
        "/data/codex-profiles",
        alias="CODEX_PROFILES_ROOT",
    )
    session_ttl_days: int = Field(30, alias="SESSION_TTL_DAYS", ge=1)
    session_cookie_secure: bool = Field(False, alias="SESSION_COOKIE_SECURE")
    usage_task_max_retries: int = Field(2, alias="USAGE_TASK_MAX_RETRIES", ge=0)
    usage_task_min_retry_delay: int = Field(5, alias="USAGE_TASK_MIN_RETRY_DELAY", gt=0)
    usage_task_max_retry_delay: int = Field(
        30, alias="USAGE_TASK_MAX_RETRY_DELAY", gt=0
    )
