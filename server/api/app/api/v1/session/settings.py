from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class SessionSettings(BaseSettings):
    model_config = SettingsConfigDict(
        frozen=True,
        populate_by_name=True,
        env_file=".env",
        env_ignore_empty=True,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ttl_days: int = Field(30, alias="SESSION_TTL_DAYS", ge=1)
    cookie_secure: bool = Field(False, alias="SESSION_COOKIE_SECURE")


@lru_cache(maxsize=1)
def get_session_settings() -> SessionSettings:
    return SessionSettings()
