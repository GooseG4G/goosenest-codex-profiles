from urllib.parse import quote

from pydantic import BaseModel, ConfigDict, Field


class RedisSettings(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
    )

    host: str = Field(min_length=1, max_length=253)
    port: int = Field(default=6379, ge=1, le=65535)
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=1024)
    broker_database: int = Field(default=0, ge=0)
    backend_database: int = Field(default=1, ge=0)

    @property
    def url(self) -> str:
        username = quote(self.username, safe="")
        password = quote(self.password, safe="")
        return f"redis://{username}:{password}@{self.host}:{self.port}"

    @property
    def broker_url(self) -> str:
        return f"{self.url.rstrip('/')}/{self.broker_database}"

    @property
    def backend_url(self) -> str:
        return f"{self.url.rstrip('/')}/{self.backend_database}"
