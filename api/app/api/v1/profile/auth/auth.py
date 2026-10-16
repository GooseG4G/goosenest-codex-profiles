import asyncio
import shutil
from pathlib import Path
from typing import Annotated
from uuid import UUID

from api.v1.event.models import ProfileAuthChanged
from api.v1.event.service import publish_event
from api.v1.profile.models import ProfileEntity, ProfileRuntime
from api.v1.session.auth import Principal, require_admin
from fastapi import APIRouter, Depends, HTTPException, status
from integrations.codex.auth import (
    authenticated,
    device_auth,
    profile_identity,
    secure_credentials,
)
from integrations.codex.models import DeviceFlow
from integrations.postgres import PostgresSession
from integrations.postgres.providers import (
    get_postgres_context,
    get_postgres_session,
)

from .models import DeviceAuthStarted, DeviceAuthStatus

router = APIRouter(prefix="/device/auth", tags=["device-auth"])
Session = Annotated[PostgresSession, Depends(get_postgres_session)]
Administrator = Annotated[Principal, Depends(require_admin)]
completion_tasks: set[asyncio.Task[None]] = set()


def _status(flow: DeviceFlow) -> DeviceAuthStatus:
    return DeviceAuthStatus(
        uid=flow.uid,
        status=flow.result_status,
        profile_id=flow.result_profile_id,
        detail=flow.result_detail or None,
    )


async def _finalize(flow: DeviceFlow, session: PostgresSession) -> None:
    async with flow.lock:
        if flow.result_status != "pending":
            return
        auth_path = flow.codex_home / "auth.json"
        if flow.error or not flow.completed or not authenticated(auth_path):
            flow.result_status = "failed"
            flow.result_detail = (
                flow.error or "Codex login did not produce valid credentials"
            )
            await device_auth.stop(flow)
            shutil.rmtree(flow.codex_home, ignore_errors=True)
            return

        await device_auth.stop(flow)
        secure_credentials(auth_path)
        identity = profile_identity(auth_path, flow.profile_id)
        existing = await session.fetchrow(
            ProfileRuntime,
            """
            SELECT jsonb_build_object(
                       'type', 'profile',
                       'href', '/api/v1/profiles/' || profile_id
                   ) AS meta,
                   profile_id, name, enabled, auth_status, usage,
                   usage_updated_at, plan_type, plan_updated_at,
                   created_at, updated_at, last_used_at, codex_home
            FROM profiles
            WHERE ($1::uuid IS NOT NULL AND profile_id=$1)
               OR ($1::uuid IS NULL AND lower(name)=lower($2))
            ORDER BY profile_id=$1 DESC
            LIMIT 1
            """,
            flow.target_profile_id,
            identity,
        )
        if flow.target_profile_id is not None and existing is None:
            flow.result_status = "failed"
            flow.result_detail = "The profile selected for sign-in no longer exists"
            shutil.rmtree(flow.codex_home, ignore_errors=True)
            return
        if existing is not None and existing.name.casefold() != identity.casefold():
            flow.result_status = "failed"
            flow.result_detail = f"Signed in as {identity}, expected {existing.name}"
            shutil.rmtree(flow.codex_home, ignore_errors=True)
            return
        if existing is None:
            profile = await session.fetchrow(
                ProfileEntity,
                """
                INSERT INTO profiles (
                    profile_id, name, codex_home, enabled, auth_status
                )
                VALUES ($1, $2, $3, true, 'authorized')
                RETURNING jsonb_build_object(
                              'type', 'profile',
                              'href', '/api/v1/profiles/' || profile_id
                          ) AS meta,
                          profile_id, name, enabled, auth_status, usage,
                          usage_updated_at, plan_type, plan_updated_at,
                          created_at, updated_at, last_used_at
                """,
                flow.profile_id,
                identity,
                str(flow.codex_home),
            )
        else:
            destination = Path(existing.codex_home) / "auth.json"
            temporary = destination.with_suffix(".json.tmp")
            shutil.copy2(auth_path, temporary)
            secure_credentials(temporary)
            temporary.replace(destination)
            shutil.rmtree(flow.codex_home)
            profile = await session.fetchrow(
                ProfileEntity,
                """
                UPDATE profiles
                SET enabled=true, auth_status='authorized', updated_at=now()
                WHERE profile_id=$1
                RETURNING jsonb_build_object(
                              'type', 'profile',
                              'href', '/api/v1/profiles/' || profile_id
                          ) AS meta,
                          profile_id, name, enabled, auth_status, usage,
                          usage_updated_at, plan_type, plan_updated_at,
                          created_at, updated_at, last_used_at
                """,
                existing.profile_id,
            )
            flow.profile_id = existing.profile_id
        assert profile is not None
        flow.committed = True
        flow.result_status = "authorized"
        flow.result_profile_id = profile.profile_id
        await publish_event(
            ProfileAuthChanged(
                profile_id=profile.profile_id,
                auth_status="authorized",
                flow_id=flow.uid,
            )
        )
        from api.v1.profile.plan.tasks import enqueue_profile_plan_refresh
        from api.v1.profile.usage.tasks import enqueue_profile_usage_refresh

        await enqueue_profile_usage_refresh(profile.profile_id)
        await enqueue_profile_plan_refresh(profile.profile_id)


async def _complete(flow: DeviceFlow) -> None:
    try:
        await asyncio.wait_for(flow.completion_event.wait(), timeout=900)
    except asyncio.TimeoutError:
        async with flow.lock:
            if flow.result_status == "pending":
                flow.result_status = "expired"
        await device_auth.cancel(flow)
        shutil.rmtree(flow.codex_home, ignore_errors=True)
        return
    try:
        async with get_postgres_context().acquire() as session:
            await _finalize(flow, session)
    except Exception as error:
        if not flow.committed:
            flow.result_status = "failed"
            flow.result_detail = f"Could not save Codex profile: {error}"
            await device_auth.stop(flow)
            shutil.rmtree(flow.codex_home, ignore_errors=True)


@router.post("", response_model=DeviceAuthStarted, status_code=status.HTTP_201_CREATED)
async def start_device_auth(
    _: Administrator,
    profile_id: UUID | None = None,
) -> DeviceAuthStarted:
    try:
        flow = await device_auth.start(profile_id)
    except (OSError, RuntimeError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    task = asyncio.create_task(_complete(flow))
    completion_tasks.add(task)
    task.add_done_callback(completion_tasks.discard)
    return DeviceAuthStarted(
        uid=flow.uid,
        one_time_code=flow.one_time_code,
        verification_url=flow.verification_url,
    )


@router.post("/{uid}", response_model=DeviceAuthStatus)
async def device_auth_status(
    uid: UUID,
    _: Administrator,
    session: Session,
) -> DeviceAuthStatus:
    flow = device_auth.get(uid)
    if flow is None:
        raise HTTPException(
            status_code=404, detail="Device authorization flow not found"
        )
    if flow.completion_event.is_set() and flow.result_status == "pending":
        await _finalize(flow, session)
    return _status(flow)


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_device_auth(uid: UUID, _: Administrator) -> None:
    flow = device_auth.get(uid)
    if flow is None:
        return
    if flow.result_status == "pending":
        await device_auth.cancel(flow)
        shutil.rmtree(flow.codex_home, ignore_errors=True)
        flow.result_status = "failed"
        flow.result_detail = "Codex sign-in was cancelled"
    device_auth.remove(uid)
