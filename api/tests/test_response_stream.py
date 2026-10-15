from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from api.v1.response import response


@pytest.mark.asyncio
async def test_stream_cleanup_acquires_its_own_database_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = object()
    context = SimpleNamespace()

    @asynccontextmanager
    async def acquire():
        yield session

    context.acquire = acquire
    saved: list[object] = []
    released: list[object] = []

    async def save_usage(db, profile_id, headers, usage):
        saved.append((db, profile_id, headers, usage))

    async def release(db, lease_id):
        released.append((db, lease_id))

    monkeypatch.setattr(response, "get_postgres_context", lambda: context)
    monkeypatch.setattr(response, "_save_usage", save_usage)
    monkeypatch.setattr(response, "release_profile", release)
    profile_id, lease_id = uuid4(), uuid4()
    headers = httpx.Headers({"x-test": "value"})
    usage = {"input_tokens": 1}

    await response._finalize_stream(profile_id, lease_id, headers, usage)

    assert saved == [(session, profile_id, headers, usage)]
    assert released == [(session, lease_id)]
