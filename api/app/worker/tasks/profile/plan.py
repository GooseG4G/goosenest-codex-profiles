import asyncio
import logging
from datetime import datetime
from uuid import UUID

from api.v1.event.models import ProfilePlanUpdated
from api.v1.event.service import publish_event
from api.v1.profile.auth.status import expire_profile_authentication
from api.v1.profile.models import ProfileRuntime
from api.v1.profile.task_settings import get_profile_task_settings
from integrations.codex.errors import CodexAuthenticationError
from integrations.codex.usage import read_codex_plan
from integrations.postgres import PostgresContext
from integrations.postgres.providers import get_postgres_settings
from worker import app
from worker.lease import claim_execution, release_execution

logger = logging.getLogger(__name__)
PLAN_REFRESH_TASK = "profiles.plan.refresh"
FIELDS = """jsonb_build_object(
                'type', 'profile',
                'href', '/api/v1/profiles/' || profile_id
            ) AS meta,
            profile_id, name, enabled, auth_status, usage, usage_updated_at,
            plan_type, plan_updated_at, created_at,
            updated_at, last_used_at, codex_home"""


def _release_execution_safely(resource_id: str, task_id: str) -> None:
    try:
        asyncio.run(release_execution(PLAN_REFRESH_TASK, resource_id, task_id))
    except Exception:
        logger.exception("Failed to release plan task lease for %s", resource_id)


async def _refresh_plan(profile_id: UUID) -> None:
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
            return
        if profile.plan_updated_at is not None:
            age = datetime.now(profile.plan_updated_at.tzinfo) - profile.plan_updated_at
            if age.total_seconds() < 60:
                return
        try:
            plan = await read_codex_plan(profile.codex_home)
        except CodexAuthenticationError:
            async with context.acquire() as session:
                await expire_profile_authentication(session, profile.profile_id)
            logger.info("Profile %s authentication expired", profile.profile_id)
            return
        async with context.acquire() as session:
            await session.execute(
                """UPDATE profiles
                   SET plan_type=$2, plan_updated_at=now(), updated_at=now()
                   WHERE profile_id=$1""",
                profile.profile_id,
                plan,
            )
        await publish_event(ProfilePlanUpdated(profile_id=profile.profile_id))
    finally:
        await context.close()


@app.task(name=PLAN_REFRESH_TASK, bind=True)
def refresh_profile_plan(self, profile_id: str) -> None:
    settings = get_profile_task_settings()
    task_id = str(self.request.id)
    try:
        if not asyncio.run(
            claim_execution(
                PLAN_REFRESH_TASK,
                profile_id,
                task_id,
                lease_ttl=settings.lease_ttl,
            )
        ):
            return
        asyncio.run(_refresh_plan(UUID(profile_id)))
    except Exception as error:
        logger.warning(
            "profiles.plan.refresh failed for %s (attempt %s): %s",
            profile_id,
            self.request.retries + 1,
            error,
        )
        if self.request.retries >= settings.max_retries:
            _release_execution_safely(profile_id, task_id)
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
        _release_execution_safely(profile_id, task_id)
