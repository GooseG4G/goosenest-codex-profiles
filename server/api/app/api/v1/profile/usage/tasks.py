import asyncio
import logging
from datetime import datetime
from uuid import UUID, uuid4

from api.v1.event.models import ProfileUsageResetCompleted, ProfileUsageUpdated
from api.v1.event.service import publish_event
from api.v1.profile.auth.status import expire_profile_authentication
from api.v1.profile.models import ProfileRuntime
from api.v1.profile.task_settings import get_profile_task_settings
from celery import shared_task
from integrations.codex.usage import (
    CodexAuthenticationError,
    consume_codex_usage_reset,
    read_codex_usage,
)
from integrations.postgres import PostgresContext
from integrations.postgres.providers import get_postgres_settings
from worker.singleflight import claim_execution, enqueue_once, release_execution

logger = logging.getLogger(__name__)
USAGE_REFRESH_TASK = "profiles.usage.refresh"
USAGE_RESET_TASK = "profiles.usage.reset.consume"
FIELDS = """jsonb_build_object(
                'type', 'profile',
                'href', '/api/v1/profiles/' || profile_id
            ) AS meta,
            profile_id, name, enabled, auth_status, usage, usage_updated_at,
            plan_type, plan_updated_at, created_at,
            updated_at, last_used_at, codex_home"""


def _release_execution_safely(
    task_name: str,
    resource_id: str,
    task_id: str,
) -> None:
    try:
        asyncio.run(release_execution(task_name, resource_id, task_id))
    except Exception:
        logger.exception(
            "Failed to release task lease %s for %s",
            task_name,
            resource_id,
        )


async def enqueue_profile_usage_refresh(profile_id: UUID) -> str:
    task_id = str(uuid4())

    async def dispatch() -> None:
        from worker import app

        await asyncio.to_thread(
            app.send_task,
            USAGE_REFRESH_TASK,
            args=[str(profile_id)],
            task_id=task_id,
        )

    return await enqueue_once(
        USAGE_REFRESH_TASK,
        str(profile_id),
        task_id,
        dispatch,
        lease_ttl=get_profile_task_settings().lease_ttl,
    )


async def enqueue_profile_usage_reset(
    profile_id: UUID,
    credit_id: str,
    idempotency_key: str,
) -> str:
    task_id = str(uuid4())

    async def dispatch() -> None:
        from worker import app

        await asyncio.to_thread(
            app.send_task,
            USAGE_RESET_TASK,
            args=[str(profile_id), credit_id, idempotency_key],
            task_id=task_id,
        )

    return await enqueue_once(
        USAGE_RESET_TASK,
        f"{profile_id}:{credit_id}",
        task_id,
        dispatch,
        lease_ttl=get_profile_task_settings().lease_ttl,
    )


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
        try:
            usage = await read_codex_usage(profile.codex_home)
        except CodexAuthenticationError:
            async with context.acquire() as session:
                await expire_profile_authentication(session, profile.profile_id)
            logger.info("Profile %s authentication expired", profile.profile_id)
            return
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


@shared_task(name=USAGE_REFRESH_TASK, bind=True)
def refresh_profile_usage(self, profile_id: str) -> None:
    settings = get_profile_task_settings()
    task_id = str(self.request.id)
    try:
        if not asyncio.run(
            claim_execution(
                USAGE_REFRESH_TASK,
                profile_id,
                task_id,
                lease_ttl=settings.lease_ttl,
            )
        ):
            return
        asyncio.run(_refresh(UUID(profile_id)))
    except Exception as error:
        logger.warning(
            "profiles.usage.refresh failed for %s (attempt %s): %s",
            profile_id,
            self.request.retries + 1,
            error,
        )
        if self.request.retries >= settings.max_retries:
            _release_execution_safely(USAGE_REFRESH_TASK, profile_id, task_id)
            raise
        delay = min(
            settings.min_retry_delay * 2**self.request.retries,
            settings.max_retry_delay,
        )
        raise self.retry(
            exc=error,
            max_retries=settings.max_retries,
            countdown=delay,
        )
    else:
        _release_execution_safely(USAGE_REFRESH_TASK, profile_id, task_id)


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


@shared_task(
    name=USAGE_RESET_TASK,
    bind=True,
)
def consume_profile_usage_reset(
    self,
    profile_id: str,
    credit_id: str,
    idempotency_key: str,
) -> str:
    settings = get_profile_task_settings()
    resource_id = f"{profile_id}:{credit_id}"
    task_id = str(self.request.id)
    try:
        if not asyncio.run(
            claim_execution(
                USAGE_RESET_TASK,
                resource_id,
                task_id,
                lease_ttl=settings.lease_ttl,
            )
        ):
            return "duplicate"
        outcome = asyncio.run(
            _consume_reset(UUID(profile_id), credit_id, idempotency_key),
        )
    except Exception as error:
        logger.warning(
            "profiles.usage.reset.consume failed for %s (attempt %s): %s",
            profile_id,
            self.request.retries + 1,
            error,
        )
        if self.request.retries >= settings.max_retries:
            _release_execution_safely(USAGE_RESET_TASK, resource_id, task_id)
            raise
        delay = min(
            settings.min_retry_delay * 2**self.request.retries,
            settings.max_retry_delay,
        )
        raise self.retry(
            exc=error,
            max_retries=settings.max_retries,
            countdown=delay,
        )
    else:
        _release_execution_safely(USAGE_RESET_TASK, resource_id, task_id)
        return outcome
