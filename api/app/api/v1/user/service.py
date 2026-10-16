from integrations.postgres import PostgresContext
from security import hash_secret

from .settings import get_account_settings


async def ensure_account(context: PostgresContext) -> None:
    settings = get_account_settings()
    if not settings.username or not settings.password:
        return
    nickname = settings.nickname or settings.username
    async with context.acquire() as session:
        await session.execute(
            """
            INSERT INTO users (username, nickname, password, role)
            VALUES ($1, $2, $3, 'administrator')
            ON CONFLICT (username) DO NOTHING
            """,
            settings.username,
            nickname,
            hash_secret(settings.password),
        )
