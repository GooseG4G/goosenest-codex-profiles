import asyncio
import logging
from uuid import UUID

from api.v1.event.models import ProfileUsageResetCompleted
from api.v1.event.service import publish_event
from api.v1.profile.models import ProfileRuntime
from api.v1.profile.task_settings import get_profile_task_settings
from integrations.codex.usage import consume_codex_usage_reset, read_codex_usage
from integrations.postgres import PostgresContext
from integrations.postgres.providers import get_postgres_settings
from worker import app
from worker.lease import claim_execution, release_execution

logger = logging.getLogger(__name__)
FIELDS = """jsonb_build_object(
                'type', 'profile',
                'href', '/api/v1/profiles/' || profile_id
            ) AS meta,
            profile_id, name, enabled, auth_status, usage, usage_updated_at,
            created_at, updated_at, last_used_at, codex_home"""


def _release_execution_safely(resource_id: str, task_id: str) -> None:
    try:
        asyncio.run(
            release_execution("profiles.usage.reset.consume", resource_id, task_id)
        )
    except Exception:
        logger.exception(
            "Failed to release usage reset task lease for %s",
            resource_id,
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

        profile_available = (
            profile is not None
            and profile.enabled
            and profile.auth_status == "authorized"
        )
        if not profile_available:
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
    settings = get_profile_task_settings()
    resource_id = f"{profile_id}:{credit_id}"
    task_id = str(self.request.id)

    try:
        if not asyncio.run(
            claim_execution(
                "profiles.usage.reset.consume",
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
            _release_execution_safely(resource_id, task_id)
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
        _release_execution_safely(
            resource_id,
            task_id,
        )

        return outcome
