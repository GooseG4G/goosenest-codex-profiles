import asyncio
import logging
from datetime import datetime
from uuid import UUID

from app.api.v1.profiles.models import ProfileRuntime
from app.api.v1.providers import get_api_settings
from app.events import ProfileUsageResetCompleted, ProfileUsageUpdated
from app.integrations.codex_usage import consume_codex_usage_reset, read_codex_usage
from app.integrations.events import publish_event
from app.integrations.postgres import PostgresContext
from app.integrations.postgres.providers import get_postgres_settings
from app.worker import app

logger = logging.getLogger(__name__)
FIELDS = """profile_id, name, enabled, auth_status, usage, usage_updated_at,
            created_at, updated_at, last_used_at, codex_home"""


async def _refresh(profile_id: UUID) -> None:
    context = PostgresContext(get_postgres_settings())
    await context.open()
    try:
        async with context.acquire() as session:
            profile = await session.fetchrow(
                ProfileRuntime,
                f"SELECT {FIELDS} FROM profiles WHERE profile_id=$1",
                profile_id,
            )
        if (
            profile is None
            or not profile.enabled
            or profile.auth_status != "authorized"
        ):
            return
        if profile.usage_updated_at is not None:
            age = (
                datetime.now(profile.usage_updated_at.tzinfo) - profile.usage_updated_at
            )
            if age.total_seconds() < 60:
                return
        usage = await read_codex_usage(profile.codex_home)
        async with context.acquire() as session:
            await session.execute(
                """UPDATE profiles
                   SET usage=$2, usage_updated_at=now(), updated_at=now()
                   WHERE profile_id=$1""",
                profile.profile_id,
                usage,
            )
        await publish_event(ProfileUsageUpdated(profile_id=profile.profile_id))
    finally:
        await context.close()


@app.task(name="profiles.usage.refresh", bind=True)
def refresh_profile_usage(self, profile_id: str) -> None:
    settings = get_api_settings()
    try:
        asyncio.run(_refresh(UUID(profile_id)))
    except Exception as error:
        logger.warning(
            "profiles.usage.refresh failed for %s (attempt %s): %s",
            profile_id,
            self.request.retries + 1,
            error,
        )
        if self.request.retries >= settings.usage_task_max_retries:
            raise
        delay = min(
            settings.usage_task_min_retry_delay * 2**self.request.retries,
            settings.usage_task_max_retry_delay,
        )
        raise self.retry(
            exc=error,
            max_retries=settings.usage_task_max_retries,
            countdown=delay,
        )


async def _consume_reset(
    profile_id: UUID,
    credit_id: str,
    idempotency_key: str,
) -> str:
    context = PostgresContext(get_postgres_settings())
    await context.open()
    try:
        async with context.acquire() as session:
            profile = await session.fetchrow(
                ProfileRuntime,
                f"SELECT {FIELDS} FROM profiles WHERE profile_id=$1",
                profile_id,
            )
        if (
            profile is None
            or not profile.enabled
            or profile.auth_status != "authorized"
        ):
            return "profileUnavailable"
        outcome = await consume_codex_usage_reset(
            profile.codex_home,
            credit_id,
            idempotency_key,
        )
        usage = await read_codex_usage(profile.codex_home)
        async with context.acquire() as session:
            await session.execute(
                """UPDATE profiles
                   SET usage=$2, usage_updated_at=now(), updated_at=now()
                   WHERE profile_id=$1""",
                profile.profile_id,
                usage,
            )
        await publish_event(
            ProfileUsageResetCompleted(
                profile_id=profile.profile_id,
                outcome=outcome,
            )
        )
        return outcome
    finally:
        await context.close()


@app.task(
    name="profiles.usage.reset.consume",
    bind=True,
)
def consume_profile_usage_reset(
    self,
    profile_id: str,
    credit_id: str,
    idempotency_key: str,
) -> str:
    settings = get_api_settings()
    try:
        return asyncio.run(
            _consume_reset(UUID(profile_id), credit_id, idempotency_key),
        )
    except Exception as error:
        logger.warning(
            "profiles.usage.reset.consume failed for %s (attempt %s): %s",
            profile_id,
            self.request.retries + 1,
            error,
        )
        if self.request.retries >= settings.usage_task_max_retries:
            raise
        delay = min(
            settings.usage_task_min_retry_delay * 2**self.request.retries,
            settings.usage_task_max_retry_delay,
        )
        raise self.retry(
            exc=error,
            max_retries=settings.usage_task_max_retries,
            countdown=delay,
        )
