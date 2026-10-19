import json
import logging
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Annotated, Any, AsyncGenerator
from uuid import UUID

import anyio
import httpx
from api.v1.profile.auth.status import expire_profile_authentication
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from integrations.codex.tokens import ensure_fresh, usage_from_headers
from integrations.postgres import PostgresSession
from integrations.postgres.providers import (
    get_postgres_context,
    get_postgres_session,
)
from security import hash_device_secret

from .affinity import (
    bind_affinity,
    clear_affinity,
    find_affinity,
    request_affinity_key,
    response_affinity_keys,
)
from .models import DeviceIdentity
from .scheduler import release_profile, reserve_profile
from .settings import get_responses_settings
from .streaming import probe_stream
from .upstream import downstream_headers, get_responses_upstream

router = APIRouter(tags=["responses"])
logger = logging.getLogger(__name__)
bearer = HTTPBearer(auto_error=False)
Session = Annotated[PostgresSession, Depends(get_postgres_session)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


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
        DeviceIdentity,
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
            SET usage=COALESCE(usage, '{}'::jsonb) || $2, usage_updated_at=now(), updated_at=now(),
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


async def _cool_down(
    session: PostgresSession,
    profile_id: UUID,
    headers: httpx.Headers,
    *,
    model: str | None = None,
) -> None:
    seconds = _retry_after_seconds(headers.get("retry-after"))
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


def _retry_after_seconds(value: str | None) -> int:
    maximum = 7 * 24 * 60 * 60
    if value is None:
        return 60
    try:
        return max(1, min(int(float(value)), maximum))
    except ValueError:
        pass
    try:
        retry_at = parsedate_to_datetime(value)
    except (TypeError, ValueError, OverflowError):
        return 60
    if retry_at.tzinfo is None:
        retry_at = retry_at.replace(tzinfo=timezone.utc)
    delay = int((retry_at - datetime.now(timezone.utc)).total_seconds())
    return max(1, min(delay, maximum))


async def _mark_success(session: PostgresSession, profile_id: UUID, model: str) -> None:
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
    affinity_ttl_days: int,
) -> None:
    async with get_postgres_context().acquire() as session:
        try:
            if response_usage:
                await _save_usage(session, profile_id, headers, response_usage)
            for affinity_key in affinity_keys:
                await bind_affinity(
                    session,
                    affinity_key,
                    profile_id,
                    affinity_ttl_days,
                )
        finally:
            await release_profile(session, lease_id)


@router.post("/responses")
async def create_response(
    request: Request, credentials: Credentials, session: Session
) -> StreamingResponse:
    user_id, _device_id = await _authorize_device(credentials, session)
    body = await request.body()
    session_key = request_affinity_key(request, body)
    preferred_profile_id = await find_affinity(session, session_key)
    model = _requested_model(body)
    settings = get_responses_settings()
    upstream_client = get_responses_upstream()
    last_error = "All Codex profiles failed"
    excluded: set[UUID] = set()

    attempts = 0
    while attempts < settings.max_attempts and (
        reservation := await reserve_profile(
            session,
            excluded=excluded,
            weekly_reserve_percent=settings.weekly_reserve_percent,
            score_tolerance=settings.score_tolerance,
            preferred_profile_id=preferred_profile_id,
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
        started_at = time.perf_counter()
        try:
            token, account_id = await ensure_fresh(profile.codex_home, session=session)
        except (OSError, ValueError, httpx.HTTPError):
            last_error = f"Profile {profile.profile_id} authentication failed"
            try:
                await expire_profile_authentication(session, profile.profile_id)
                await clear_affinity(session, session_key)
            finally:
                await release_profile(session, reservation.lease_id)
            continue
        except BaseException:
            await release_profile(session, reservation.lease_id)
            raise
        try:
            upstream = await upstream_client.send(
                settings.url, body, request, token, account_id
            )
            headers_elapsed_ms = (time.perf_counter() - started_at) * 1_000
            if upstream.status_code == 401:
                await upstream.aclose()
                token, account_id = await ensure_fresh(
                    profile.codex_home, force=True, session=session
                )
                upstream = await upstream_client.send(
                    settings.url,
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
            first_event_elapsed_ms = (time.perf_counter() - started_at) * 1_000
            logger.info(
                "responses upstream profile_id=%s status=%s http=%s "
                "headers_ms=%.1f first_event_ms=%.1f request_id=%s",
                profile.profile_id,
                upstream.status_code,
                upstream.http_version,
                headers_elapsed_ms,
                first_event_elapsed_ms,
                upstream.headers.get("x-request-id")
                or upstream.headers.get("x-oai-request-id", "-"),
            )
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
            elif upstream.is_success:
                await _mark_success(session, profile.profile_id, model)
                await bind_affinity(
                    session,
                    session_key,
                    profile.profile_id,
                    settings.affinity_ttl_days,
                )
                for affinity_key in response_affinity_keys(probe.prefix):
                    await bind_affinity(
                        session,
                        affinity_key,
                        profile.profile_id,
                        settings.affinity_ttl_days,
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
        except BaseException:
            if upstream is not None:
                await upstream.aclose()
            await release_profile(session, reservation.lease_id)
            raise

        response_headers = downstream_headers(upstream.headers)
        response_headers["Cache-Control"] = "no-cache"
        response_headers["X-Accel-Buffering"] = "no"

        async def stream_body(
            response: httpx.Response = upstream,
            iterator=probe.iterator,
            prefix: bytes = probe.prefix,
            selected_profile_id: UUID = profile.profile_id,
            selected_lease_id: UUID = reservation.lease_id,
            bind_response_affinity: bool = (
                upstream.is_success and probe.failure is None
            ),
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
                affinity_keys = (
                    response_affinity_keys(bytes(captured))
                    if bind_response_affinity
                    else set()
                )
                with anyio.CancelScope(shield=True):
                    await response.aclose()
                    await _finalize_stream(
                        selected_profile_id,
                        selected_lease_id,
                        response.headers,
                        response_usage,
                        affinity_keys,
                        settings.affinity_ttl_days,
                    )

        return StreamingResponse(
            stream_body(), status_code=upstream.status_code, headers=response_headers
        )

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=last_error
    )
