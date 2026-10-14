from functools import lru_cache
from typing import AsyncGenerator

from settings import get_settings

from .postgres import PostgresContext, PostgresSession
from .settings import PostgresSettings

__all__ = [
    "get_postgres_settings",
    "get_postgres_context",
    "get_postgres_session",
]


@lru_cache(maxsize=1)
def get_postgres_settings() -> PostgresSettings:
    settings = get_settings()

    postgres_settings = PostgresSettings(
        host=settings.postgres_host,
        port=settings.postgres_port,
        database=settings.postgres_database,
        username=settings.postgres_username,
        password=settings.postgres_password,
    )

    return postgres_settings


@lru_cache(maxsize=1)
def get_postgres_context() -> PostgresContext:
    return PostgresContext(get_postgres_settings())


async def get_postgres_session() -> AsyncGenerator[PostgresSession, None]:
    async with get_postgres_context().acquire() as session:
        yield session
