from pathlib import Path

from app.api.v1.providers import get_api_settings
from app.integrations.postgres import PostgresContext
from app.integrations.postgres.providers import get_postgres_context
from app.security import hash_secret

SCHEMA_PATH = Path(__file__).parents[1] / "postgres" / "scheme.sql"


async def initialize_database(context: PostgresContext | None = None) -> None:
    context = context or get_postgres_context()
    settings = get_api_settings()
    if not context.is_open:
        await context.open()

    async with context.acquire() as session:
        await session.execute(SCHEMA_PATH.read_text(encoding="utf-8"))
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
