from uuid import UUID

from integrations.postgres import PostgresSession
from security import hash_device_secret, issue_device_secret

from .models import DeviceCreate, DeviceEntity, DeviceIssued, DeviceMeta


def device_meta(user_id: UUID, device_id: UUID) -> DeviceMeta:
    return DeviceMeta(
        href=f"/api/v1/users/{user_id}/devices/{device_id}",
    )


async def list_devices(
    session: PostgresSession,
    user_id: UUID,
) -> list[DeviceEntity]:
    devices = await session.fetch(
        DeviceEntity,
        """
        SELECT jsonb_build_object(
                   'type', 'device',
                   'href', '/api/v1/users/' || user_id || '/devices/' || device_id
               ) AS meta,
               device_id, user_id, name, enabled, created_at, last_used_at
        FROM devices WHERE user_id = $1 ORDER BY created_at, device_id
        """,
        user_id,
    )
    return devices


async def issue_device(
    session: PostgresSession,
    user_id: UUID,
    body: DeviceCreate,
) -> DeviceIssued:
    secret = issue_device_secret()
    device = await session.fetchrow(
        DeviceEntity,
        """
        INSERT INTO devices (user_id, name, secret)
        VALUES ($1, $2, $3)
        RETURNING jsonb_build_object(
                      'type', 'device',
                      'href', '/api/v1/users/' || user_id || '/devices/' || device_id
                  ) AS meta,
                  device_id, user_id, name, enabled, created_at, last_used_at
        """,
        user_id,
        body.name,
        hash_device_secret(secret),
    )
    assert device is not None
    return DeviceIssued(**device.model_dump(), secret=secret)
