from uuid import UUID

from app.api.v1.users.models import DeviceCreate, DeviceIssued, DeviceRead
from app.integrations.postgres import PostgresSession
from app.security import hash_device_secret, issue_device_secret


async def list_devices(session: PostgresSession, user_id: UUID) -> list[DeviceRead]:
    return await session.fetch(
        DeviceRead,
        """
        SELECT device_id, user_id, name, enabled, created_at, last_used_at
        FROM devices WHERE user_id = $1 ORDER BY created_at, device_id
        """,
        user_id,
    )


async def issue_device(
    session: PostgresSession,
    user_id: UUID,
    body: DeviceCreate,
) -> DeviceIssued:
    secret = issue_device_secret()
    device = await session.fetchrow(
        DeviceRead,
        """
        INSERT INTO devices (user_id, name, secret)
        VALUES ($1, $2, $3)
        RETURNING device_id, user_id, name, enabled, created_at, last_used_at
        """,
        user_id,
        body.name,
        hash_device_secret(secret),
    )
    assert device is not None
    return DeviceIssued(**device.model_dump(), secret=secret)
