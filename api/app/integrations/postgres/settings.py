from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class PostgresSettings(BaseSettings):
    model_config = SettingsConfigDict(
        frozen=True,
        populate_by_name=True,
    )

    host: str = Field(
        default="postgres",
        alias="POSTGRES_HOST",
        min_length=1,
        max_length=253,
        description="Database server host",
    )

    port: int = Field(
        default=5432,
        alias="POSTGRES_PORT",
        ge=1,
        le=65535,
        description="Database server port",
    )

    database: str = Field(
        alias="POSTGRES_DATABASE",
        min_length=1,
        max_length=63,
        description="Database name",
    )

    username: str = Field(
        alias="POSTGRES_USERNAME",
        min_length=1,
        max_length=63,
        description="Database username",
    )

    password: str = Field(
        alias="POSTGRES_PASSWORD",
        min_length=1,
        max_length=1024,
        description="Database password",
    )

    @property
    def dsn(self) -> str:
        dsn = (
            f"postgresql://{self.username}:{self.password}"
            f"@{self.host}:{self.port}/{self.database}"
        )

        return dsn
