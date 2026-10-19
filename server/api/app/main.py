from contextlib import AsyncExitStack, asynccontextmanager

from api.v1.event.event import router as events_router
from api.v1.profile.auth.auth import (
    router as profile_auth_router,
)
from api.v1.profile.auth.auth import (
    shutdown_device_auth,
)
from api.v1.profile.profile import router as profiles_router
from api.v1.response.response import router as responses_router
from api.v1.response.upstream import get_responses_upstream
from api.v1.session.session import router as sessions_router
from api.v1.user.device.device import router as user_devices_router
from api.v1.user.service import ensure_account
from api.v1.user.user import router as users_router
from fastapi import FastAPI
from integrations.postgres.providers import get_postgres_context
from integrations.redis.providers import get_redis_context
from integrations.codex.app_server_pool import get_codex_app_server_pool


@asynccontextmanager
async def lifespan(_: FastAPI):
    context = get_postgres_context()
    redis = get_redis_context()
    upstream = get_responses_upstream()
    async with AsyncExitStack() as stack:
        await context.open()
        stack.push_async_callback(context.close)
        await ensure_account(context)
        stack.push_async_callback(shutdown_device_auth)
        await redis.open()
        stack.push_async_callback(redis.close)
        await upstream.open()
        stack.push_async_callback(upstream.close)
        stack.push_async_callback(get_codex_app_server_pool().close)
        yield


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
