from typing import Annotated
from uuid import UUID

from api.v1.session.auth import Principal, get_principal
from api.v1.user.models import UserIdentity
from fastapi import APIRouter, Depends, HTTPException, Response, status
from integrations.postgres import PostgresSession
from integrations.postgres.providers import get_postgres_session

from .models import (
    DeviceCreate,
    DeviceEntities,
    DeviceEntity,
    DeviceIssued,
    DeviceMeta,
    DeviceUpdate,
)
from .service import issue_device, list_devices

router = APIRouter(prefix="/users/{user_id}/devices", tags=["user-devices"])
Session = Annotated[PostgresSession, Depends(get_postgres_session)]
CurrentUser = Annotated[Principal, Depends(get_principal)]


def require_access(principal: Principal, user_id: UUID) -> None:
    if principal.role != "administrator" and principal.user_id != user_id:
        raise HTTPException(status_code=403, detail="Device access is forbidden")


async def require_user(session: PostgresSession, user_id: UUID) -> None:
    exists = await session.fetchrow(
        UserIdentity,
        "SELECT user_id FROM users WHERE user_id=$1",
        user_id,
    )
    if exists is None:
        raise HTTPException(status_code=404, detail="User not found")


@router.get("")
async def read_devices(
    user_id: UUID,
    principal: CurrentUser,
    session: Session,
) -> DeviceEntities:
    require_access(principal, user_id)
    await require_user(session, user_id)
    items = await list_devices(session, user_id)
    return DeviceEntities(
        meta=DeviceMeta(
            href=f"/api/v1/users/{user_id}/devices",
            total=len(items),
        ),
        items=items,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_device(
    user_id: UUID,
    body: DeviceCreate,
    principal: CurrentUser,
    session: Session,
) -> DeviceIssued:
    require_access(principal, user_id)
    await require_user(session, user_id)
    return await issue_device(session, user_id, body)


@router.get("/{device_id}")
async def read_device(
    user_id: UUID,
    device_id: UUID,
    principal: CurrentUser,
    session: Session,
) -> DeviceEntity:
    require_access(principal, user_id)
    device = await session.fetchrow(
        DeviceEntity,
        """
        SELECT jsonb_build_object(
                   'type', 'device',
                   'href', '/api/v1/users/' || user_id || '/devices/' || device_id
               ) AS meta,
               device_id, user_id, name, enabled, created_at, last_used_at
        FROM devices WHERE user_id=$1 AND device_id=$2
        """,
        user_id,
        device_id,
    )
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.patch("/{device_id}")
async def update_device(
    user_id: UUID,
    device_id: UUID,
    body: DeviceUpdate,
    principal: CurrentUser,
    session: Session,
) -> DeviceEntity:
    require_access(principal, user_id)
    device = await session.fetchrow(
        DeviceEntity,
        """
        UPDATE devices
        SET name=COALESCE($3,name), enabled=COALESCE($4,enabled)
        WHERE user_id=$1 AND device_id=$2
        RETURNING jsonb_build_object(
                      'type', 'device',
                      'href', '/api/v1/users/' || user_id || '/devices/' || device_id
                  ) AS meta,
                  device_id, user_id, name, enabled, created_at, last_used_at
        """,
        user_id,
        device_id,
        body.name,
        body.enabled,
    )
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    user_id: UUID,
    device_id: UUID,
    principal: CurrentUser,
    session: Session,
) -> Response:
    require_access(principal, user_id)
    result = await session.execute(
        "DELETE FROM devices WHERE user_id=$1 AND device_id=$2",
        user_id,
        device_id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Device not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
