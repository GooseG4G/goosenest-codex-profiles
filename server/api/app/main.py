from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1.device_auth import router as device_auth_router
from app.api.v1.events import router as events_router
from app.api.v1.me import router as me_router
from app.api.v1.profiles.profiles import router as profiles_router
from app.api.v1.responses import router as responses_router
from app.api.v1.sessions import router as sessions_router
from app.api.v1.users.users import router as users_router
from app.database import initialize_database
from app.integrations.postgres.providers import get_postgres_context
from app.integrations.redis.providers import get_redis_context


@asynccontextmanager
async def lifespan(_: FastAPI):
    context = get_postgres_context()
    redis = get_redis_context()
    await initialize_database(context)
    await redis.open()
    try:
        yield
    finally:
        await redis.close()
        await context.close()


app = FastAPI(title="Codex Profiles API", lifespan=lifespan)

app.include_router(profiles_router, prefix="/api/v1")
app.include_router(device_auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(responses_router, prefix="/api/v1")
app.include_router(sessions_router, prefix="/api/v1")
app.include_router(me_router, prefix="/api/v1")
app.include_router(events_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
