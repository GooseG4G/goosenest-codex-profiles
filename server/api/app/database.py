from integrations.postgres import PostgresContext
from integrations.postgres.providers import get_postgres_context
from security import hash_secret
from settings import get_settings


async def initialize_database(context: PostgresContext | None = None) -> None:
    context = context or get_postgres_context()
    settings = get_settings()
    if not context.is_open:
        await context.open()

    async with context.acquire() as session:
        if settings.api_bootstartup_username and settings.api_bootstartup_password:
            nickname = (
                settings.api_bootstartup_nickname or settings.api_bootstartup_username
            )
            await session.execute(
                """
                INSERT INTO users (username, nickname, password, role)
                VALUES ($1, $2, $3, 'administrator')
                ON CONFLICT (username) DO NOTHING
                """,
                settings.api_bootstartup_username,
                nickname,
                hash_secret(settings.api_bootstartup_password),
            )
