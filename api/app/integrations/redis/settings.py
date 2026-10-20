from urllib.parse import quote

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class RedisSettings(BaseSettings):
    model_config = SettingsConfigDict(
        frozen=True,
        populate_by_name=True,
        env_file=".env",
        env_ignore_empty=True,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = Field(
        default="redis",
        alias="REDIS_HOST",
        min_length=1,
        max_length=253,
        description="Redis server host",
    )

    port: int = Field(
        default=6379,
        alias="REDIS_PORT",
        ge=1,
        le=65535,
        description="Redis server port",
    )

    username: str = Field(
        alias="REDIS_USERNAME",
        min_length=1,
        max_length=128,
        description="Redis username",
    )

    password: str = Field(
        alias="REDIS_PASSWORD",
        min_length=1,
        max_length=1024,
        description="Redis password",
    )

    broker_database: int = Field(
        default=0,
        alias="REDIS_BROKER_DATABASE",
        ge=0,
        description="Redis database used by the task broker",
    )

    @property
    def url(self) -> str:
        username = quote(self.username, safe="")
        password = quote(self.password, safe="")
        return f"redis://{username}:{password}@{self.host}:{self.port}"

    @property
    def broker_url(self) -> str:
        return f"{self.url.rstrip('/')}/{self.broker_database}"
