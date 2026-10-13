import asyncpg
from contextlib import asynccontextmanager

from typing import (
    Any, Type, Optional,
    Iterable, AsyncGenerator,
    List, Sequence,
)

from .settings import PostgresSettings
from .types import PostgresResultT


class PostgresSession:
    def __init__(
        self,
        context: 'PostgresContext',
        connection: asyncpg.Connection
    ) -> None:
        self._context = context
        self._connection = connection

    @property
    def settings(self) -> PostgresSettings:
        return self._context.settings

    @asynccontextmanager
    async def transaction(self) -> AsyncGenerator["PostgresSession", None]:
        async with self._connection.transaction():
            yield self

    async def execute(
        self,
        query: str,
        *args: Any,
        timeout: Optional[float] = None,
    ) -> str:
        return await self._connection.execute(
            query,
            *args,
            timeout=timeout,
        )

    async def executemany(
        self,
        query: str,
        args: Iterable[Sequence[Any]],
        *,
        timeout: Optional[float] = None,
    ) -> None:
        await self._connection.executemany(
            query,
            args,
            timeout=timeout,
        )

    async def fetch(
        self,
        model: Type[PostgresResultT],
        query: str,
        *args: Any,
        timeout: Optional[float] = None,
    ) -> List[PostgresResultT]:
        results = await self._connection.fetch(
            query,
            *args,
            timeout=timeout,
        )

        result = [
            model.model_validate({**result})
            for result in results
        ]

        return result

    async def fetchmany(
        self,
        model: Type[PostgresResultT],
        query: str,
        args: Iterable[Sequence[Any]],
        *,
        timeout: Optional[float] = None,
    ) -> List[PostgresResultT]:
        results = await self._connection.fetchmany(
            query,
            args,
            timeout=timeout,
        )

        result = [
            model.model_validate({**result})
            for result in results
        ]

        return result

    async def fetchrow(
        self,
        model: Type[PostgresResultT],
        query: str,
        *args: Any,
        timeout: Optional[float] = None,
    ) -> Optional[PostgresResultT]:
        result = await self._connection.fetchrow(
            query,
            *args,
            timeout=timeout,
        )

        if result is None:
            return None

        result = model.model_validate({**result})
        return result


class PostgresContext:
    def __init__(self, settings: PostgresSettings, **kwargs: Any) -> None:
        self._settings = (
            PostgresSettings.model_validate
            (settings.model_dump() | kwargs)
        )

        self._pool: Optional[asyncpg.Pool] = None

    @property
    def settings(self) -> PostgresSettings:
        return self._settings

    async def open(self) -> None:
        if self._pool is not None:
            return None

        self._pool = await (
            asyncpg.create_pool
            (dsn=self._settings.dsn)
        )

    @asynccontextmanager
    async def acquire(self) -> AsyncGenerator[PostgresSession, None]:
        if self._pool is None:
            message = (
                "PostgresContext is not open. "
                "Call 'await open()' first."
            )

            raise RuntimeError(message)

        async with self._pool.acquire() as connection:
            yield PostgresSession(self, connection)

    async def close(self) -> None:
        if isinstance(self._pool, asyncpg.Pool):
            await self._pool.close()

        self._pool = None
