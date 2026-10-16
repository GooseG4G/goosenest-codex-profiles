from api.v1.settings import get_api_settings
from integrations.postgres import PostgresContext
from integrations.postgres.providers import get_postgres_context
from security import hash_secret


async def initialize_database(context: PostgresContext | None = None) -> None:
    context = context or get_postgres_context()
    settings = get_api_settings()
    if not context.is_open:
        await context.open()

    async with context.acquire() as session:
        if settings.account_username and settings.account_password:
            nickname = settings.account_nickname or settings.account_username
            await session.execute(
                """
                INSERT INTO users (username, nickname, password, role)
                VALUES ($1, $2, $3, 'administrator')
                ON CONFLICT (username) DO NOTHING
                """,
                settings.account_username,
                nickname,
                hash_secret(settings.account_password),
            )
