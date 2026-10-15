import hashlib
import json
import logging
from typing import Annotated, Any, AsyncGenerator
from uuid import UUID, uuid4

import httpx
from api.v1.profile.auth.status import expire_profile_authentication
from api.v1.settings import get_api_settings
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from integrations.codex.tokens import ensure_fresh, usage_from_headers
from integrations.postgres import PostgresSession
from integrations.postgres.providers import (
    get_postgres_context,
    get_postgres_session,
)
from pydantic import BaseModel
from security import hash_device_secret

from .scheduler import bind_affinity, clear_affinity, release_profile, reserve_profile
from .streaming import probe_stream

router = APIRouter(tags=["responses"])
logger = logging.getLogger(__name__)
bearer = HTTPBearer(auto_error=False)
Session = Annotated[PostgresSession, Depends(get_postgres_session)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]

_RESPONSE_HEADERS_TO_STRIP = {
    "connection",
    "content-length",
    "date",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "server",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


class DeviceId(BaseModel):
    device_id: UUID
    user_id: UUID


def _affinity_key(source: str, value: str) -> str:
    return hashlib.sha256(f"{source}:{value}".encode()).hexdigest()


def _session_key(request: Request, body: bytes) -> str:
    raw: str | None = None
    for name in (
        "x-session-affinity",
        "x-session-id",
        "x-multi-turn-session-id",
        "x-chat-id",
        "x-conversation-id",
    ):
        value = request.headers.get(name)
        if value and len(value) <= 512:
            raw = f"header:{name}:{value}"
            break
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        payload = {}
    if raw is None and isinstance(payload, dict):
        for key in ("conversation_id", "conversationId", "session_id", "sessionId"):
            value = payload.get(key)
            if isinstance(value, str) and value and len(value) <= 512:
                raw = f"body:{key}:{value}"
                break
        conversation = payload.get("conversation")
        if raw is None and isinstance(conversation, str) and conversation:
            raw = f"body:conversation:{conversation[:512]}"
        elif raw is None and isinstance(conversation, dict):
            value = conversation.get("id")
            if isinstance(value, str) and value:
                raw = f"body:conversation:{value[:512]}"
        if raw is None:
            value = payload.get("previous_response_id")
            if isinstance(value, str) and value and len(value) <= 512:
                raw = f"body:previous_response_id:{value}"
        metadata = payload.get("metadata")
        if raw is None and isinstance(metadata, dict):
            value = metadata.get("session_id") or metadata.get("conversation_id")
            if isinstance(value, str) and value and len(value) <= 512:
                raw = f"metadata:{value}"
    # A request without a chat identity is treated as a new conversation. Using
    # the device as a fallback would pin every new chat from that device to one
    # profile. Continuations become sticky through their response ID alias.
    raw = raw or f"request:{uuid4()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _requested_model(body: bytes) -> str:
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return "unknown"
    value = payload.get("model") if isinstance(payload, dict) else None
    return value if isinstance(value, str) and value else "unknown"


async def _authorize_device(
    credentials: HTTPAuthorizationCredentials | None, session: PostgresSession
) -> tuple[UUID, UUID]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Device bearer secret is required")
    device = await session.fetchrow(
        DeviceId,
        """UPDATE devices
        SET last_used_at=now()
        WHERE secret=$1 AND enabled=true
        RETURNING device_id, user_id""",
        hash_device_secret(credentials.credentials),
    )
    if device is None:
        raise HTTPException(status_code=401, detail="Invalid or disabled device secret")
    return device.user_id, device.device_id


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
                cooldown_until=NULL, consecutive_failures=0,
                last_failure_at=NULL
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


def _response_affinity_keys_from_sse(payload: bytes) -> set[str]:
    keys: set[str] = set()
    for raw_line in payload.splitlines():
        line = raw_line.decode("utf-8", errors="ignore")
        if not line.startswith("data:"):
            continue
        try:
            event = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        response = event.get("response") if isinstance(event, dict) else None
        response_id = response.get("id") if isinstance(response, dict) else None
        if isinstance(response_id, str) and response_id:
            keys.add(_affinity_key("body:previous_response_id", response_id))
    return keys


async def _cool_down(
    session: PostgresSession,
    profile_id: UUID,
    headers: httpx.Headers,
    *,
    model: str | None = None,
) -> None:
    retry_after = headers.get("retry-after")
    try:
        seconds = max(1, min(int(float(retry_after or "60")), 7 * 24 * 60 * 60))
    except ValueError:
        seconds = 60
    if model is None:
        await session.execute(
            """UPDATE profiles
            SET cooldown_until=now() + make_interval(secs => $2),
                consecutive_failures=consecutive_failures + 1,
                last_failure_at=now(), updated_at=now()
            WHERE profile_id=$1""",
            profile_id,
            seconds,
        )
        return
    await session.execute(
        """INSERT INTO profile_model_health
            (profile_id, model, consecutive_failures, cooldown_until,
             last_failure_at)
        VALUES ($1, $2, 1, now() + make_interval(secs => $3), now())
        ON CONFLICT (profile_id, model) DO UPDATE SET
            consecutive_failures=profile_model_health.consecutive_failures + 1,
            cooldown_until=EXCLUDED.cooldown_until,
            last_failure_at=EXCLUDED.last_failure_at""",
        profile_id,
        model,
        seconds,
    )


async def _mark_success(
    session: PostgresSession, profile_id: UUID, model: str
) -> None:
    await session.execute(
        """UPDATE profiles SET consecutive_failures=0, last_failure_at=NULL,
        cooldown_until=NULL, updated_at=now() WHERE profile_id=$1""",
        profile_id,
    )
    await session.execute(
        """INSERT INTO profile_model_health
            (profile_id, model, consecutive_failures, cooldown_until,
             last_failure_at, last_success_at)
        VALUES ($1, $2, 0, NULL, NULL, now())
        ON CONFLICT (profile_id, model) DO UPDATE SET
            consecutive_failures=0, cooldown_until=NULL,
            last_failure_at=NULL, last_success_at=now()""",
        profile_id,
        model,
    )


async def _finalize_stream(
    profile_id: UUID,
    lease_id: UUID,
    headers: httpx.Headers,
    response_usage: dict[str, Any] | None,
    affinity_keys: set[str],
    affinity_minutes: int,
) -> None:
    async with get_postgres_context().acquire() as session:
        if response_usage:
            await _save_usage(session, profile_id, headers, response_usage)
        for affinity_key in affinity_keys:
            await bind_affinity(
                session, affinity_key, profile_id, affinity_minutes
            )
        await release_profile(session, lease_id)


async def _send(
    client: httpx.AsyncClient,
    url: str,
    body: bytes,
    request: Request,
    token: str,
    account_id: str | None,
) -> httpx.Response:
    # Keep the upstream contract deliberately small. Codex clients send
    # experimental feature/version headers that are meaningful for the client
    # endpoint, but forwarding them with pooled account credentials can select
    # an incompatible upstream schema (for example, rejecting `compaction`
    # input entities). Session-affinity headers are proxy-local as well.
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": request.headers.get("content-type", "application/json"),
        "Accept": request.headers.get("accept", "text/event-stream"),
        "User-Agent": "codex-cli",
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
    user_id, _device_id = await _authorize_device(credentials, session)
    body = await request.body()
    session_key = _session_key(request, body)
    model = _requested_model(body)
    settings = get_api_settings()
    client = httpx.AsyncClient(timeout=settings.request_timeout)
    last_error = "All Codex profiles failed"
    excluded: set[UUID] = set()

    attempts = 0
    while attempts < settings.profile_max_attempts and (
        reservation := await reserve_profile(
            session,
            excluded=excluded,
            weekly_reserve_percent=settings.profile_weekly_reserve_percent,
            score_tolerance=settings.profile_score_tolerance,
            session_key=session_key,
            model=model,
        )
    ):
        attempts += 1
        profile = reservation.profile
        excluded.add(profile.profile_id)
        logger.info(
            "responses route user_id=%s profile_id=%s attempt=%s",
            user_id,
            profile.profile_id,
            attempts,
        )
        upstream: httpx.Response | None = None
        try:
            token, account_id = await ensure_fresh(profile.codex_home, session=session)
        except (OSError, ValueError, httpx.HTTPError):
            last_error = f"Profile {profile.profile_id} authentication failed"
            await expire_profile_authentication(session, profile.profile_id)
            await clear_affinity(session, session_key)
            await release_profile(session, reservation.lease_id)
            continue
        try:
            upstream = await _send(
                client, settings.responses_url, body, request, token, account_id
            )
            if upstream.status_code == 401:
                await upstream.aclose()
                token, account_id = await ensure_fresh(
                    profile.codex_home, force=True, session=session
                )
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
                    await expire_profile_authentication(session, profile.profile_id)
                if upstream.status_code == 429:
                    await _cool_down(
                        session,
                        profile.profile_id,
                        upstream.headers,
                    )
                elif upstream.status_code >= 500:
                    await _cool_down(
                        session,
                        profile.profile_id,
                        upstream.headers,
                        model=model,
                    )
                await upstream.aclose()
                await clear_affinity(session, session_key)
                await release_profile(session, reservation.lease_id)
                continue
            probe = await probe_stream(upstream)
            if probe.failure is not None:
                last_error = (
                    f"Profile {profile.profile_id} upstream stream failed: "
                    f"{probe.failure.message}"
                )
                logger.warning(
                    "responses upstream stream failure profile_id=%s code=%s "
                    "retryable=%s message=%s",
                    profile.profile_id,
                    probe.failure.code,
                    probe.failure.retryable,
                    probe.failure.message,
                )
                if probe.failure.retryable:
                    account_wide = probe.failure.kind == "rate_limit"
                    await _cool_down(
                        session,
                        profile.profile_id,
                        upstream.headers,
                        model=None if account_wide else model,
                    )
                    await upstream.aclose()
                    await clear_affinity(session, session_key)
                    await release_profile(session, reservation.lease_id)
                    continue
            else:
                await _mark_success(session, profile.profile_id, model)
                await bind_affinity(
                    session,
                    session_key,
                    profile.profile_id,
                    settings.profile_affinity_minutes,
                )
                for affinity_key in _response_affinity_keys_from_sse(probe.prefix):
                    await bind_affinity(
                        session,
                        affinity_key,
                        profile.profile_id,
                        settings.profile_affinity_minutes,
                    )
        except (OSError, ValueError, httpx.HTTPError) as error:
            last_error = f"Profile {profile.profile_id} failed: {type(error).__name__}"
            await _cool_down(
                session,
                profile.profile_id,
                upstream.headers if upstream is not None else httpx.Headers(),
                model=model,
            )
            await clear_affinity(session, session_key)
            await release_profile(session, reservation.lease_id)
            continue

        response_headers = {
            name: value
            for name, value in upstream.headers.items()
            if name.lower() not in _RESPONSE_HEADERS_TO_STRIP
        }

        async def stream_body(
            response: httpx.Response = upstream,
            iterator=probe.iterator,
            prefix: bytes = probe.prefix,
            selected_profile_id: UUID = profile.profile_id,
            selected_lease_id: UUID = reservation.lease_id,
        ) -> AsyncGenerator[bytes, None]:
            captured = bytearray()
            try:
                if prefix:
                    captured.extend(prefix)
                    yield prefix
                async for chunk in iterator:
                    captured.extend(chunk)
                    yield chunk
            finally:
                response_usage = _response_usage_from_sse(bytes(captured))
                await response.aclose()
                await client.aclose()
                await _finalize_stream(
                    selected_profile_id,
                    selected_lease_id,
                    response.headers,
                    response_usage,
                    _response_affinity_keys_from_sse(bytes(captured)),
                    settings.profile_affinity_minutes,
                )

        return StreamingResponse(
            stream_body(), status_code=upstream.status_code, headers=response_headers
        )

    await client.aclose()
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=last_error
    )
