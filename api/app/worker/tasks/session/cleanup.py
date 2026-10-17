import asyncio
import logging

from integrations.postgres import PostgresContext
from integrations.postgres.providers import get_postgres_settings
from worker import app

logger = logging.getLogger(__name__)
CLEANUP_TASK = "sessions.expired.cleanup"
CLEANUP_BATCH_SIZE = 1_000
CLEANUP_MAX_BATCHES = 24


def _deleted_rows(command_tag: str) -> int:
    return int(command_tag.rsplit(" ", maxsplit=1)[-1])


async def cleanup_expired_sessions() -> None:
    context = PostgresContext(get_postgres_settings())
    await context.open()
    try:
        deleted = 0
        async with context.acquire() as session:
            for _ in range(CLEANUP_MAX_BATCHES):
                async with session.transaction():
                    batch = _deleted_rows(
                        await session.execute(
                            """DELETE FROM sessions
                            WHERE session_id IN (
                                SELECT session_id FROM sessions
                                WHERE expires_at <= now()
                                ORDER BY expires_at
                                LIMIT $1
                            )""",
                            CLEANUP_BATCH_SIZE,
                        )
                    )
                deleted += batch
                if batch < CLEANUP_BATCH_SIZE:
                    break
        logger.info("Expired sessions cleaned up: %s", deleted)
    finally:
        await context.close()


@app.task(name=CLEANUP_TASK)
def cleanup_sessions() -> None:
    asyncio.run(cleanup_expired_sessions())
