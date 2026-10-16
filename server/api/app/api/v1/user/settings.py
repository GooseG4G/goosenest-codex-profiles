from functools import lru_cache

from pydantic import EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AccountSettings(BaseSettings):
    model_config = SettingsConfigDict(
        frozen=True,
        populate_by_name=True,
        env_file=".env",
        env_ignore_empty=True,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    username: EmailStr | None = Field(None, alias="ACCOUNT_USERNAME")
    nickname: str | None = Field(None, alias="ACCOUNT_NICKNAME")
    password: str | None = Field(None, alias="ACCOUNT_PASSWORD")


@lru_cache(maxsize=1)
def get_account_settings() -> AccountSettings:
    return AccountSettings()
