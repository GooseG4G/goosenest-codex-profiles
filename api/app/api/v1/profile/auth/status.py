from uuid import UUID

from api.v1.event.models import ProfileAuthChanged
from api.v1.event.service import publish_event
from integrations.postgres import PostgresSession


async def expire_profile_authentication(
    session: PostgresSession, profile_id: UUID
) -> None:
    await session.execute(
        """UPDATE profiles
           SET auth_status='expired', updated_at=now()
           WHERE profile_id=$1""",
        profile_id,
    )
    await publish_event(
        ProfileAuthChanged(profile_id=profile_id, auth_status="expired")
    )
