from typing import Annotated
from uuid import UUID

from asyncpg import UniqueViolationError
from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.v1.auth import Principal, get_principal, require_admin
from app.integrations.postgres import PostgresSession
from app.integrations.postgres.providers import get_postgres_session
from app.security import hash_secret

from .device_service import issue_device, list_devices
from .models import (
    DeviceCreate,
    DeviceIssued,
    DeviceRead,
    DeviceUpdate,
    UserCreate,
    UserRead,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])
Session = Annotated[PostgresSession, Depends(get_postgres_session)]
CurrentUser = Annotated[Principal, Depends(get_principal)]
Admin = Annotated[Principal, Depends(require_admin)]


async def _read_user(session: PostgresSession, user_id: UUID) -> UserRead:
    user = await session.fetchrow(
        UserRead,
        """
        SELECT user_id, username, nickname, role, created_at, updated_at
        FROM users WHERE user_id = $1
        """,
        user_id,
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _require_device_access(principal: Principal, user_id: UUID) -> None:
    if principal.role != "administrator" and principal.user_id != user_id:
        raise HTTPException(status_code=403, detail="Device access is forbidden")


@router.get("")
async def read_users(_: CurrentUser, session: Session) -> list[UserRead]:
    return await session.fetch(
        UserRead,
        """
        SELECT user_id, username, nickname, role, created_at, updated_at
        FROM users ORDER BY created_at, user_id
        """,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreate, _: Admin, session: Session) -> UserRead:
    try:
        user = await session.fetchrow(
            UserRead,
            """
            INSERT INTO users (username, nickname, password, role)
            VALUES ($1, $2, $3, $4)
            RETURNING user_id, username, nickname, role, created_at, updated_at
            """,
            body.username,
            body.nickname,
            hash_secret(body.password),
            body.role,
        )
    except UniqueViolationError as error:
        raise HTTPException(
            status_code=409, detail="Username already exists"
        ) from error
    assert user is not None
    return user


@router.get("/{user_id}")
async def read_user(user_id: UUID, _: CurrentUser, session: Session) -> UserRead:
    return await _read_user(session, user_id)


@router.patch("/{user_id}")
async def update_user(
    user_id: UUID,
    body: UserUpdate,
    _: Admin,
    session: Session,
) -> UserRead:
    current = await _read_user(session, user_id)
    values = body.model_dump(exclude_unset=True)
    username = values.get("username", current.username)
    nickname = values.get("nickname", current.nickname)
    role = values.get("role", current.role)
    password = values.get("password")
    try:
        user = await session.fetchrow(
            UserRead,
            """
            UPDATE users
            SET username = $2, nickname = $3, role = $4,
                password = COALESCE($5, password), updated_at = now()
            WHERE user_id = $1
            RETURNING user_id, username, nickname, role, created_at, updated_at
            """,
            user_id,
            username,
            nickname,
            role,
            hash_secret(password) if password is not None else None,
        )
    except UniqueViolationError as error:
        raise HTTPException(
            status_code=409, detail="Username already exists"
        ) from error
    assert user is not None
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: UUID, principal: Admin, session: Session) -> Response:
    if principal.user_id == user_id:
        raise HTTPException(
            status_code=409, detail="Administrator cannot delete own account"
        )
    result = await session.execute("DELETE FROM users WHERE user_id = $1", user_id)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="User not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{user_id}/devices")
async def read_devices(
    user_id: UUID,
    principal: CurrentUser,
    session: Session,
) -> list[DeviceRead]:
    _require_device_access(principal, user_id)
    await _read_user(session, user_id)
    return await list_devices(session, user_id)


@router.post("/{user_id}/devices", status_code=status.HTTP_201_CREATED)
async def create_device(
    user_id: UUID,
    body: DeviceCreate,
    principal: CurrentUser,
    session: Session,
) -> DeviceIssued:
    _require_device_access(principal, user_id)
    await _read_user(session, user_id)
    return await issue_device(session, user_id, body)


@router.get("/{user_id}/devices/{device_id}")
async def read_device(
    user_id: UUID,
    device_id: UUID,
    principal: CurrentUser,
    session: Session,
) -> DeviceRead:
    _require_device_access(principal, user_id)
    device = await session.fetchrow(
        DeviceRead,
        """
        SELECT device_id, user_id, name, enabled, created_at, last_used_at
        FROM devices WHERE user_id = $1 AND device_id = $2
        """,
        user_id,
        device_id,
    )
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.patch("/{user_id}/devices/{device_id}")
async def update_device(
    user_id: UUID,
    device_id: UUID,
    body: DeviceUpdate,
    principal: CurrentUser,
    session: Session,
) -> DeviceRead:
    _require_device_access(principal, user_id)
    device = await session.fetchrow(
        DeviceRead,
        """
        UPDATE devices
        SET name = COALESCE($3, name), enabled = COALESCE($4, enabled)
        WHERE user_id = $1 AND device_id = $2
        RETURNING device_id, user_id, name, enabled, created_at, last_used_at
        """,
        user_id,
        device_id,
        body.name,
        body.enabled,
    )
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.delete("/{user_id}/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    user_id: UUID,
    device_id: UUID,
    principal: CurrentUser,
    session: Session,
) -> Response:
    _require_device_access(principal, user_id)
    result = await session.execute(
        "DELETE FROM devices WHERE user_id = $1 AND device_id = $2",
        user_id,
        device_id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Device not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
