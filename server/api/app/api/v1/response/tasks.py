import asyncio
import logging

from integrations.postgres import PostgresContext
from integrations.postgres.providers import get_postgres_settings
from worker.worker import app

logger = logging.getLogger(__name__)
CLEANUP_TASK = "responses.state.cleanup"
CLEANUP_BATCH_SIZE = 5_000


async def cleanup_expired_response_state() -> None:
    context = PostgresContext(get_postgres_settings())
    await context.open()
    try:
        async with context.acquire() as session:
            async with session.transaction():
                leases = await session.execute(
                    """DELETE FROM profile_leases
                    WHERE lease_id IN (
                        SELECT lease_id FROM profile_leases
                        WHERE expires_at <= now()
                        ORDER BY expires_at
                        LIMIT $1
                    )""",
                    CLEANUP_BATCH_SIZE,
                )
                affinities = await session.execute(
                    """DELETE FROM chat_profile_affinity
                    WHERE session_key IN (
                        SELECT session_key FROM chat_profile_affinity
                        WHERE expires_at <= now()
                        ORDER BY expires_at
                        LIMIT $1
                    )""",
                    CLEANUP_BATCH_SIZE,
                )
        logger.info(
            "Expired response state cleaned up: leases=%s affinities=%s",
            leases,
            affinities,
        )
    finally:
        await context.close()


@app.task(name=CLEANUP_TASK)
def cleanup_response_state() -> None:
    asyncio.run(cleanup_expired_response_state())
