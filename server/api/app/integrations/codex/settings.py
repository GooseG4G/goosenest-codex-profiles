from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class CodexSettings(BaseSettings):
    model_config = SettingsConfigDict(
        frozen=True,
        populate_by_name=True,
        env_file=".env",
        env_ignore_empty=True,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    executable: str = Field("codex", alias="CODEX_EXECUTABLE", min_length=1)
    profiles_root: str = Field(
        "/data/codex-profiles",
        alias="CODEX_PROFILES_ROOT",
        min_length=1,
    )
