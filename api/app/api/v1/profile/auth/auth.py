import time
from typing import Annotated
from uuid import UUID

from api.v1.profile.models import (
    DeviceAuthStarted,
    DeviceAuthStatus,
    ProfileEntity,
)
from api.v1.session.auth import Principal, require_admin
from fastapi import APIRouter, Depends, HTTPException, status
from integrations.codex.auth import device_auth, profile_identity
from integrations.postgres import PostgresSession
from integrations.postgres.providers import get_postgres_session

router = APIRouter(prefix="/device/auth", tags=["device-auth"])
Session = Annotated[PostgresSession, Depends(get_postgres_session)]
Administrator = Annotated[Principal, Depends(require_admin)]


@router.post("", response_model=DeviceAuthStarted, status_code=status.HTTP_201_CREATED)
async def start_device_auth(_: Administrator) -> DeviceAuthStarted:
    try:
        flow = await device_auth.start()
    except (OSError, RuntimeError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return DeviceAuthStarted(
        uid=flow.uid,
        one_time_code=flow.one_time_code,
        verification_url=flow.verification_url,
    )


@router.post("/{uid}", response_model=DeviceAuthStatus)
async def commit_device_auth(
    uid: UUID,
    _: Administrator,
    session: Session,
) -> DeviceAuthStatus:
    flow = device_auth.get(uid)
    if flow is None:
        raise HTTPException(
            status_code=404, detail="Device authorization flow not found"
        )
    if time.monotonic() - flow.created_at >= 900:
        if flow.process.returncode is None:
            flow.process.terminate()
        device_auth.remove(uid)
        return DeviceAuthStatus(uid=uid, status="expired")
    if flow.process.returncode is None:
        return DeviceAuthStatus(uid=uid, status="pending")
    auth_path = flow.codex_home / "auth.json"
    if flow.process.returncode != 0 or not auth_path.is_file():
        device_auth.remove(uid)
        return DeviceAuthStatus(
            uid=uid,
            status="failed",
            detail="Codex login did not produce auth.json",
        )
    if not flow.committed:
        profile = await session.fetchrow(
            ProfileEntity,
            """
            INSERT INTO profiles (profile_id, name, codex_home, enabled, auth_status)
            VALUES ($1, $2, $3, true, 'authorized')
            RETURNING jsonb_build_object(
                          'type', 'profile',
                          'href', '/api/v1/profiles/' || profile_id
                      ) AS meta,
                      profile_id, name, enabled, auth_status, usage,
                      usage_updated_at, subscription_expires_at,
                      created_at, updated_at, last_used_at
            """,
            flow.profile_id,
            profile_identity(auth_path, flow.profile_id),
            str(flow.codex_home),
        )
        assert profile is not None
        flow.committed = True
    device_auth.remove(uid)
    return DeviceAuthStatus(
        uid=uid,
        status="authorized",
        profile_id=flow.profile_id,
    )
