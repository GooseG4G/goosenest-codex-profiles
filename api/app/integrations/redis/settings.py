from pydantic import BaseModel, ConfigDict, Field


class RedisSettings(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
    )

    url: str = Field(min_length=1, max_length=2048)
    broker_database: int = Field(default=0, ge=0)
    backend_database: int = Field(default=1, ge=0)

    @property
    def broker_url(self) -> str:
        return f"{self.url.rstrip('/')}/{self.broker_database}"

    @property
    def backend_url(self) -> str:
        return f"{self.url.rstrip('/')}/{self.backend_database}"
