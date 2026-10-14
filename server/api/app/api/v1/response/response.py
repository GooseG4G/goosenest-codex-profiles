import json
from typing import Annotated, Any, AsyncGenerator
from uuid import UUID

import httpx
from api.v1.settings import get_api_settings
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from integrations.codex.tokens import ensure_fresh, usage_from_headers
from integrations.postgres import PostgresSession
from integrations.postgres.providers import get_postgres_session
from pydantic import BaseModel
from security import hash_device_secret

from .scheduler import release_profile, reserve_profile

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


async def _save_usage(
    session: PostgresSession,
    profile_id: UUID,
    headers: httpx.Headers,
    response_usage: dict[str, Any] | None = None,
) -> None:
    usage = usage_from_headers(headers)
    if usage:
        if response_usage:
            usage["lastResponseUsage"] = response_usage
        await session.execute(
            """UPDATE profiles
            SET usage=$2, usage_updated_at=now(), updated_at=now(),
                cooldown_until=NULL
            WHERE profile_id=$1""",
            profile_id,
            usage,
        )


def _response_usage_from_sse(payload: bytes) -> dict[str, Any] | None:
    latest: dict[str, Any] | None = None
    for raw_line in payload.splitlines():
        line = raw_line.decode("utf-8", errors="ignore")
        if not line.startswith("data:"):
            continue
        try:
            event = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        if event.get("type") != "response.completed":
            continue
        response = event.get("response")
        value = response.get("usage") if isinstance(response, dict) else None
        if isinstance(value, dict):
            latest = value
    return latest


async def _cool_down(
    session: PostgresSession,
    profile_id: UUID,
    headers: httpx.Headers,
) -> None:
    retry_after = headers.get("retry-after")
    try:
        seconds = max(1, min(int(float(retry_after or "60")), 7 * 24 * 60 * 60))
    except ValueError:
        seconds = 60
    await session.execute(
        """UPDATE profiles
        SET cooldown_until=now() + make_interval(secs => $2), updated_at=now()
        WHERE profile_id=$1""",
        profile_id,
        seconds,
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
    client = httpx.AsyncClient(timeout=settings.request_timeout)
    last_error = "All Codex profiles failed"
    excluded: set[UUID] = set()

    while reservation := await reserve_profile(
        session,
        excluded=excluded,
        weekly_reserve_percent=settings.profile_weekly_reserve_percent,
        score_tolerance=settings.profile_score_tolerance,
    ):
        profile = reservation.profile
        excluded.add(profile.profile_id)
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
            await release_profile(session, reservation.lease_id)
            continue
        try:
            upstream = await _send(
                client, settings.responses_url, body, request, token, account_id
            )
            if upstream.status_code == 401:
                await upstream.aclose()
                token, account_id = await ensure_fresh(profile.codex_home, force=True)
                upstream = await _send(
                    client,
                    settings.responses_url,
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
                if upstream.status_code == 401:
                    await session.execute(
                        """UPDATE profiles
                        SET auth_status='expired', updated_at=now()
                        WHERE profile_id=$1""",
                        profile.profile_id,
                    )
                if upstream.status_code == 429:
                    await _cool_down(
                        session,
                        profile.profile_id,
                        upstream.headers,
                    )
                await upstream.aclose()
                await release_profile(session, reservation.lease_id)
                continue
        except (OSError, ValueError, httpx.HTTPError) as error:
            last_error = f"Profile {profile.profile_id} failed: {type(error).__name__}"
            await release_profile(session, reservation.lease_id)
            continue

        response_headers = {
            name: value
            for name, value in upstream.headers.items()
            if name.lower() in {"content-type", "openai-request-id", "x-request-id"}
        }

        async def stream_body(
            response: httpx.Response = upstream,
        ) -> AsyncGenerator[bytes, None]:
            captured = bytearray()
            try:
                async for chunk in response.aiter_raw():
                    captured.extend(chunk)
                    yield chunk
            finally:
                response_usage = _response_usage_from_sse(bytes(captured))
                if response_usage:
                    await _save_usage(
                        session,
                        profile.profile_id,
                        response.headers,
                        response_usage,
                    )
                await response.aclose()
                await release_profile(session, reservation.lease_id)
                await client.aclose()

        return StreamingResponse(
            stream_body(), status_code=upstream.status_code, headers=response_headers
        )

    await client.aclose()
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=last_error
    )
