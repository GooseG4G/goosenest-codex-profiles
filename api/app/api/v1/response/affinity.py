import hashlib
import json
from uuid import UUID

from fastapi import Request
from integrations.postgres import PostgresSession
from pydantic import BaseModel


class AffinityRow(BaseModel):
    profile_id: UUID


def affinity_key(source: str, value: str) -> str:
    return hashlib.sha256(f"{source}:{value}".encode()).hexdigest()


def request_affinity_key(request: Request, body: bytes) -> str | None:
    for name in (
        "thread-id",
        "session-id",
        "x-chat-id",
        "x-session-id",
    ):
        value = request.headers.get(name)
        if value and len(value) <= 512:
            return affinity_key(f"header:{name}", value)
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    for key in ("conversation_id",):
        value = payload.get(key)
        if isinstance(value, str) and value and len(value) <= 512:
            return affinity_key(f"body:{key}", value)
    conversation = payload.get("conversation")
    if isinstance(conversation, str) and conversation:
        return affinity_key("body:conversation", conversation[:512])
    if isinstance(conversation, dict):
        value = conversation.get("id")
        if isinstance(value, str) and value:
            return affinity_key("body:conversation", value[:512])
    value = payload.get("previous_response_id")
    if isinstance(value, str) and value and len(value) <= 512:
        return affinity_key("body:previous_response_id", value)
    metadata = payload.get("metadata")
    if isinstance(metadata, dict):
        value = metadata.get("session_id") or metadata.get("conversation_id")
        if isinstance(value, str) and value and len(value) <= 512:
            return affinity_key("metadata", value)
    return None


def response_affinity_keys(payload: bytes) -> set[str]:
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
            keys.add(affinity_key("body:previous_response_id", response_id))
        conversation = (
            response.get("conversation") if isinstance(response, dict) else None
        )
        conversation_id = (
            conversation.get("id") if isinstance(conversation, dict) else None
        )
        if isinstance(conversation_id, str) and conversation_id:
            keys.add(affinity_key("body:conversation", conversation_id))
    return keys


async def find_affinity(
    session: PostgresSession, session_key: str | None
) -> UUID | None:
    if session_key is None:
        return None
    row = await session.fetchrow(
        AffinityRow,
        """SELECT profile_id FROM chat_profile_affinity
        WHERE session_key=$1 AND expires_at > now()""",
        session_key,
    )
    return row.profile_id if row else None


async def clear_affinity(session: PostgresSession, session_key: str | None) -> None:
    if session_key is not None:
        await session.execute(
            "DELETE FROM chat_profile_affinity WHERE session_key=$1", session_key
        )


async def bind_affinity(
    session: PostgresSession,
    session_key: str | None,
    profile_id: UUID,
    ttl_days: int,
) -> None:
    if session_key is None:
        return
    await session.execute(
        """INSERT INTO chat_profile_affinity
            (session_key, profile_id, assigned_at, expires_at)
        VALUES ($1, $2, now(), now() + make_interval(days => $3))
        ON CONFLICT (session_key) DO UPDATE SET
            profile_id=EXCLUDED.profile_id,
            assigned_at=CASE
                WHEN chat_profile_affinity.profile_id=EXCLUDED.profile_id
                THEN chat_profile_affinity.assigned_at ELSE now() END,
            expires_at=EXCLUDED.expires_at,
            last_failure_at=NULL""",
        session_key,
        profile_id,
        ttl_days,
    )
