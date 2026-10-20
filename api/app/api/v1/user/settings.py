from functools import lru_cache

from typing import Optional

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

    username: Optional[EmailStr] = Field(
        default=None,
        alias="ACCOUNT_USERNAME",
        description="Bootstrap administrator email address",
    )

    nickname: Optional[str] = Field(
        default=None,
        alias="ACCOUNT_NICKNAME",
        description="Bootstrap administrator display name",
    )

    password: Optional[str] = Field(
        default=None,
        alias="ACCOUNT_PASSWORD",
        description="Bootstrap administrator password",
    )


@lru_cache(maxsize=1)
def get_account_settings() -> AccountSettings:
    return AccountSettings()
