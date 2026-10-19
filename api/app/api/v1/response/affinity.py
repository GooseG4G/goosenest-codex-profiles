import hashlib
from uuid import UUID

from fastapi import Request
from integrations.postgres import PostgresSession
from pydantic import BaseModel


class AffinityRow(BaseModel):
    profile_id: UUID


def affinity_key(source: str, value: str) -> str:
    return hashlib.sha256(f"{source}:{value}".encode()).hexdigest()


def request_affinity_key(request: Request) -> str | None:
    for name in (
        "thread-id",
        "session-id",
        "x-chat-id",
        "x-session-id",
    ):
        value = request.headers.get(name)
        if value and len(value) <= 512:
            return affinity_key(f"header:{name}", value)
    return None


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
