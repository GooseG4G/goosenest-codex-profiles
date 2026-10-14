from typing import Annotated, Literal
from uuid import UUID

from fastapi import Cookie, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel

from app.integrations.postgres import PostgresSession
from app.integrations.postgres.providers import get_postgres_session
from app.security import hash_session_token, verify_secret

Role = Literal["user", "administrator"]
basic = HTTPBasic(auto_error=False)


class Principal(BaseModel):
    user_id: UUID
    username: str
    role: Role


async def get_principal(
    credentials: Annotated[HTTPBasicCredentials | None, Depends(basic)],
    session: Annotated[PostgresSession, Depends(get_postgres_session)],
    session_token: Annotated[str | None, Cookie()] = None,
) -> Principal:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication is required",
    )
    if session_token:
        principal = await session.fetchrow(
            Principal,
            """
            UPDATE sessions AS s
               SET last_seen_at = now()
              FROM users AS u
             WHERE s.token_hash = $1
               AND s.expires_at > now()
               AND u.user_id = s.user_id
            RETURNING u.user_id, u.username, u.role
            """,
            hash_session_token(session_token),
        )
        if principal is not None:
            return principal

    if credentials is None:
        raise unauthorized

    row = await session.fetchrow(
        PrincipalWithPassword,
        "SELECT user_id, username, role, password FROM users WHERE username = $1",
        credentials.username,
    )
    if row is None or not verify_secret(credentials.password, row.password):
        raise unauthorized
    return Principal(user_id=row.user_id, username=row.username, role=row.role)


class PrincipalWithPassword(Principal):
    password: str


async def require_admin(
    principal: Annotated[Principal, Depends(get_principal)],
) -> Principal:
    if principal.role != "administrator":
        raise HTTPException(status_code=403, detail="Administrator role is required")
    return principal
