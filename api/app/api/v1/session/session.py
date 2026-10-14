from datetime import datetime, timedelta, timezone
from typing import Annotated

from api.v1.settings import get_api_settings
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from integrations.postgres import PostgresSession
from integrations.postgres.providers import get_postgres_session
from pydantic import BaseModel, EmailStr
from security import hash_session_token, issue_session_token, verify_secret

from .auth import Principal, PrincipalWithPassword, get_principal

router = APIRouter(prefix="/sessions", tags=["sessions"])
Session = Annotated[PostgresSession, Depends(get_postgres_session)]


class SessionCredentials(BaseModel):
    username: EmailStr
    password: str


@router.post("", response_model=Principal, status_code=status.HTTP_201_CREATED)
async def login(
    body: SessionCredentials, request: Request, response: Response, session: Session
) -> Principal:
    user = await session.fetchrow(
        PrincipalWithPassword,
        "SELECT user_id, username, role, password FROM users WHERE username = $1",
        str(body.username),
    )
    if user is None or not verify_secret(body.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    settings = get_api_settings()
    token = issue_session_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days)
    await session.execute(
        """
        INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
        VALUES ($1, $2, $3, $4, $5)
        """,
        user.user_id,
        hash_session_token(token),
        expires_at,
        request.headers.get("user-agent"),
        request.client.host if request.client else None,
    )
    response.set_cookie(
        "session_token",
        token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        max_age=settings.session_ttl_days * 86400,
        path="/",
    )
    return Principal(user_id=user.user_id, username=user.username, role=user.role)


@router.get("/current", response_model=Principal)
async def current(principal: Annotated[Principal, Depends(get_principal)]) -> Principal:
    return principal


@router.delete("/current", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session: Session,
    session_token: Annotated[str | None, Cookie()] = None,
) -> None:
    if session_token:
        await session.execute(
            "DELETE FROM sessions WHERE token_hash = $1",
            hash_session_token(session_token),
        )
    response.delete_cookie("session_token", path="/")
