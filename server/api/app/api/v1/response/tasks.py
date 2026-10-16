import asyncio
import logging

from celery import shared_task
from integrations.postgres import PostgresContext, PostgresSession
from integrations.postgres.providers import get_postgres_settings

logger = logging.getLogger(__name__)
CLEANUP_TASK = "responses.state.cleanup"
CLEANUP_BATCH_SIZE = 1_000
CLEANUP_MAX_BATCHES = 24


def _deleted_rows(command_tag: str) -> int:
    return int(command_tag.rsplit(" ", maxsplit=1)[-1])


async def _delete_in_batches(session: PostgresSession, query: str) -> int:
    deleted = 0
    for _ in range(CLEANUP_MAX_BATCHES):
        async with session.transaction():
            batch = _deleted_rows(await session.execute(query, CLEANUP_BATCH_SIZE))
        deleted += batch
        if batch < CLEANUP_BATCH_SIZE:
            break
    return deleted


async def cleanup_expired_response_state() -> None:
    context = PostgresContext(get_postgres_settings())
    await context.open()
    try:
        async with context.acquire() as session:
            leases = await _delete_in_batches(
                session,
                """DELETE FROM profile_leases
                    WHERE lease_id IN (
                        SELECT lease_id FROM profile_leases
                        WHERE expires_at <= now()
                        ORDER BY expires_at
                        LIMIT $1
                    )""",
            )
            affinities = await _delete_in_batches(
                session,
                """DELETE FROM chat_profile_affinity
                    WHERE session_key IN (
                        SELECT session_key FROM chat_profile_affinity
                        WHERE expires_at <= now()
                        ORDER BY expires_at
                        LIMIT $1
                    )""",
            )
        logger.info(
            "Expired response state cleaned up: leases=%s affinities=%s",
            leases,
            affinities,
        )
    finally:
        await context.close()


@shared_task(name=CLEANUP_TASK)
def cleanup_response_state() -> None:
    asyncio.run(cleanup_expired_response_state())
