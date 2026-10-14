from functools import lru_cache

from .settings import CodexSettings


@lru_cache(maxsize=1)
def get_codex_settings() -> CodexSettings:
    codex_settings = CodexSettings()

    return codex_settings
