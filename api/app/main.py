from contextlib import asynccontextmanager

from api.v1.event.event import router as events_router
from api.v1.profile.auth.auth import router as profile_auth_router
from api.v1.profile.profile import router as profiles_router
from api.v1.response.response import router as responses_router
from api.v1.response.upstream import get_responses_upstream
from api.v1.session.session import router as sessions_router
from api.v1.user.device.device import router as user_devices_router
from api.v1.user.user import router as users_router
from database import initialize_database
from fastapi import FastAPI
from integrations.postgres.providers import get_postgres_context
from integrations.redis.providers import get_redis_context


@asynccontextmanager
async def lifespan(_: FastAPI):
    context = get_postgres_context()
    redis = get_redis_context()
    upstream = get_responses_upstream()
    await initialize_database(context)
    await redis.open()
    await upstream.open()
    try:
        yield
    finally:
        await redis.close()
        await upstream.close()
        await context.close()


app = FastAPI(title="Codex Profiles API", lifespan=lifespan)

app.include_router(profiles_router, prefix="/api/v1")
app.include_router(profile_auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(user_devices_router, prefix="/api/v1")
app.include_router(responses_router, prefix="/api/v1")
app.include_router(sessions_router, prefix="/api/v1")
app.include_router(events_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
