from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class CodexSettings(BaseSettings):
    model_config = SettingsConfigDict(
        frozen=True,
        populate_by_name=True,
    )

    executable: str = Field(
        default="codex",
        alias="CODEX_EXECUTABLE",
        min_length=1,
        description="Codex executable used for app-server operations",
    )

    profiles_root: str = Field(
        default="/data/codex-profiles",
        alias="CODEX_PROFILES_ROOT",
        min_length=1,
        description="Directory containing isolated Codex profile homes",
    )

    backend_url: str = Field(
        default="https://chatgpt.com/backend-api/wham/",
        alias="CODEX_BACKEND_URL",
        min_length=1,
        description="Codex ChatGPT backend base URL",
    )
