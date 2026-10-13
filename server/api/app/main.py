from fastapi import FastAPI

from app.api.v1.profiles.profiles import router as profiles_router

app = FastAPI(title="Codex Profiles API")

app.include_router(profiles_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
