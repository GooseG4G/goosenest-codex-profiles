from pydantic import BaseModel, ConfigDict, Field


class PostgresSettings(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
    )

    host: str = Field(
        min_length=1,
        max_length=253,
        description="Database server host",
    )

    port: int = Field(
        default=5432,
        ge=1,
        le=65535,
        description="Database server port",
    )

    database: str = Field(
        min_length=1,
        max_length=63,
        description="Database name",
    )

    username: str = Field(
        min_length=1,
        max_length=63,
        description="Database username",
    )

    password: str = Field(
        min_length=1,
        max_length=1024,
        description="Database password",
    )

    @property
    def dsn(self) -> str:
        dsn =  (
            f"postgresql://{self.username}:{self.password}"
            f"@{self.host}:{self.port}/{self.database}"
        )
        
        return dsn
