from typing import Annotated, AsyncGenerator
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.api.v1.profiles.models import ProfileRuntime
from app.api.v1.providers import get_api_settings
from app.integrations.codex_tokens import ensure_fresh, usage_from_headers
from app.integrations.postgres import PostgresSession
from app.integrations.postgres.providers import get_postgres_session
from app.security import hash_device_secret

router = APIRouter(tags=["responses"])
bearer = HTTPBearer(auto_error=False)
Session = Annotated[PostgresSession, Depends(get_postgres_session)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


class DeviceId(BaseModel):
    device_id: UUID


async def _authorize_device(
    credentials: HTTPAuthorizationCredentials | None, session: PostgresSession
) -> None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Device bearer secret is required")
    device = await session.fetchrow(
        DeviceId,
        """UPDATE devices
        SET last_used_at=now()
        WHERE secret=$1 AND enabled=true
        RETURNING device_id""",
        hash_device_secret(credentials.credentials),
    )
    if device is None:
        raise HTTPException(status_code=401, detail="Invalid or disabled device secret")


async def _profiles(session: PostgresSession) -> list[ProfileRuntime]:
    profiles = await session.fetch(
        ProfileRuntime,
        """
        SELECT profile_id, name, codex_home, enabled, auth_status, usage,
               usage_updated_at, created_at, updated_at, last_used_at
        FROM profiles
        WHERE enabled=true AND auth_status='authorized'
          AND (COALESCE((usage->'primary'->>'usedPercent')::float, 0) < 100
               OR COALESCE(
                   (usage->'primary'->>'resetsAt')::bigint, 0
               ) < EXTRACT(EPOCH FROM now()))
          AND (COALESCE((usage->'secondary'->>'usedPercent')::float, 0) < 100
               OR COALESCE(
                   (usage->'secondary'->>'resetsAt')::bigint, 0
               ) < EXTRACT(EPOCH FROM now()))
        ORDER BY last_used_at NULLS FIRST, created_at, profile_id
        """,
    )
    if not profiles:
        raise HTTPException(status_code=503, detail="No available Codex profiles")
    return profiles


async def _save_usage(
    session: PostgresSession, profile_id: UUID, headers: httpx.Headers
) -> None:
    usage = usage_from_headers(headers)
    if usage:
        await session.execute(
            """UPDATE profiles
            SET usage=$2, usage_updated_at=now(), updated_at=now()
            WHERE profile_id=$1""",
            profile_id,
            usage,
        )


async def _send(
    client: httpx.AsyncClient,
    url: str,
    body: bytes,
    request: Request,
    token: str,
    account_id: str | None,
) -> httpx.Response:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": request.headers.get("content-type", "application/json"),
        "Accept": request.headers.get("accept", "text/event-stream"),
        "User-Agent": request.headers.get("user-agent", "codex-cli"),
    }
    if account_id:
        headers["ChatGPT-Account-Id"] = account_id
    return await client.send(
        client.build_request("POST", url, content=body, headers=headers), stream=True
    )


@router.post("/responses")
async def create_response(
    request: Request, credentials: Credentials, session: Session
) -> StreamingResponse:
    await _authorize_device(credentials, session)
    body = await request.body()
    settings = get_api_settings()
    client = httpx.AsyncClient(timeout=settings.openai_request_timeout)
    last_error = "All Codex profiles failed"

    for profile in await _profiles(session):
        try:
            token, account_id = await ensure_fresh(profile.codex_home)
        except (OSError, ValueError, httpx.HTTPError):
            last_error = f"Profile {profile.profile_id} authentication failed"
            await session.execute(
                """UPDATE profiles
                SET auth_status='expired', updated_at=now()
                WHERE profile_id=$1""",
                profile.profile_id,
            )
            continue
        try:
            upstream = await _send(
                client, settings.openai_responses_url, body, request, token, account_id
            )
            if upstream.status_code == 401:
                await upstream.aclose()
                token, account_id = await ensure_fresh(profile.codex_home, force=True)
                upstream = await _send(
                    client,
                    settings.openai_responses_url,
                    body,
                    request,
                    token,
                    account_id,
                )
            await _save_usage(session, profile.profile_id, upstream.headers)
            if upstream.status_code in (401, 429) or upstream.status_code >= 500:
                last_error = (
                    f"Profile {profile.profile_id} returned {upstream.status_code}"
                )
                await session.execute(
                    "UPDATE profiles SET last_used_at=now() WHERE profile_id=$1",
                    profile.profile_id,
                )
                if upstream.status_code == 401:
                    await session.execute(
                        """UPDATE profiles
                        SET auth_status='expired', updated_at=now()
                        WHERE profile_id=$1""",
                        profile.profile_id,
                    )
                await upstream.aclose()
                continue
            await session.execute(
                "UPDATE profiles SET last_used_at=now() WHERE profile_id=$1",
                profile.profile_id,
            )
        except (OSError, ValueError, httpx.HTTPError) as error:
            last_error = f"Profile {profile.profile_id} failed: {type(error).__name__}"
            continue

        response_headers = {
            name: value
            for name, value in upstream.headers.items()
            if name.lower() in {"content-type", "openai-request-id", "x-request-id"}
        }

        async def stream_body(
            response: httpx.Response = upstream,
        ) -> AsyncGenerator[bytes, None]:
            try:
                async for chunk in response.aiter_raw():
                    yield chunk
            finally:
                await response.aclose()
                await client.aclose()

        return StreamingResponse(
            stream_body(), status_code=upstream.status_code, headers=response_headers
        )

    await client.aclose()
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=last_error
    )
