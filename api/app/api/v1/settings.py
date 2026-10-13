from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ApiSettings(BaseSettings):
    model_config = SettingsConfigDict(
        frozen=True,
        populate_by_name=True,
        env_file=".env",
        env_ignore_empty=True,
        env_file_encoding="utf-8",
    )

    postgres_host: str = Field("postgres", alias="POSTGRES_HOST")
    postgres_port: int = Field(5432, alias="POSTGRES_PORT")
    postgres_database: str = Field(..., alias="POSTGRES_DATABASE")
    postgres_username: str = Field(..., alias="POSTGRES_USERNAME")
    postgres_password: str = Field(..., alias="POSTGRES_PASSWORD")

    api_bootstartup_username: Optional[str] = Field(
        None,
        alias="API_BOOTSTARTUP_USERNAME",
    )
    api_bootstartup_nickname: Optional[str] = Field(
        None,
        alias="API_BOOTSTARTUP_NICKNAME",
    )
    api_bootstartup_password: Optional[str] = Field(
        None,
        alias="API_BOOTSTARTUP_PASSWORD",
    )
