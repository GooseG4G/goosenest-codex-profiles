from typing import Annotated
from uuid import UUID

from api.v1.session.auth import Principal, get_principal, require_admin
from asyncpg import UniqueViolationError
from fastapi import APIRouter, Depends, HTTPException, Response, status
from integrations.postgres import PostgresSession
from integrations.postgres.providers import get_postgres_session
from security import hash_secret

from .models import (
    UserCreate,
    UserEntities,
    UserEntity,
    UserMeta,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])
Session = Annotated[PostgresSession, Depends(get_postgres_session)]
CurrentUser = Annotated[Principal, Depends(get_principal)]
Administrator = Annotated[Principal, Depends(require_admin)]


async def _read_user(session: PostgresSession, user_id: UUID) -> UserEntity:
    user = await session.fetchrow(
        UserEntity,
        """
        SELECT jsonb_build_object(
                   'type', 'user',
                   'href', '/api/v1/users/' || user_id
               ) AS meta,
               user_id, username, nickname, role, created_at, updated_at
        FROM users WHERE user_id = $1
        """,
        user_id,
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("")
async def read_users(_: CurrentUser, session: Session) -> UserEntities:
    items = await session.fetch(
        UserEntity,
        """
        SELECT jsonb_build_object(
                   'type', 'user',
                   'href', '/api/v1/users/' || user_id
               ) AS meta,
               user_id, username, nickname, role, created_at, updated_at
        FROM users ORDER BY created_at, user_id
        """,
    )
    return UserEntities(
        meta=UserMeta(href="/api/v1/users", total=len(items)),
        items=items,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate, _: Administrator, session: Session
) -> UserEntity:
    try:
        user = await session.fetchrow(
            UserEntity,
            """
            INSERT INTO users (username, nickname, password, role)
            VALUES ($1, $2, $3, $4)
            RETURNING jsonb_build_object(
                          'type', 'user',
                          'href', '/api/v1/users/' || user_id
                      ) AS meta,
                      user_id, username, nickname, role, created_at, updated_at
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
async def read_user(user_id: UUID, _: CurrentUser, session: Session) -> UserEntity:
    return await _read_user(session, user_id)


@router.patch("/{user_id}")
async def update_user(
    user_id: UUID,
    body: UserUpdate,
    _: Administrator,
    session: Session,
) -> UserEntity:
    current = await _read_user(session, user_id)
    values = body.model_dump(exclude_unset=True)
    nickname = values.get("nickname", current.nickname)
    role = values.get("role", current.role)
    password = values.get("password")
    user = await session.fetchrow(
        UserEntity,
        """
        UPDATE users
        SET nickname = $2, role = $3,
            password = COALESCE($4, password), updated_at = now()
        WHERE user_id = $1
        RETURNING jsonb_build_object(
                      'type', 'user',
                      'href', '/api/v1/users/' || user_id
                  ) AS meta,
                  user_id, username, nickname, role, created_at, updated_at
        """,
        user_id,
        nickname,
        role,
        hash_secret(password) if password is not None else None,
    )
    assert user is not None
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID, principal: Administrator, session: Session
) -> Response:
    if principal.user_id == user_id:
        raise HTTPException(
            status_code=409, detail="Administrator cannot delete own account"
        )
    result = await session.execute("DELETE FROM users WHERE user_id = $1", user_id)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="User not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
