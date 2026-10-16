import asyncio
import json
import re
import time
from urllib.parse import urlsplit

from api.v1.session.auth import Principal, get_session_principal
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from integrations.postgres.providers import get_postgres_context
from integrations.redis.providers import get_redis_context
from pydantic import TypeAdapter, ValidationError

from .access import can_receive_event
from .models import ServerEvent, StreamEvent
from .service import EVENT_STREAM

router = APIRouter(tags=["events"])
event_adapter = TypeAdapter(ServerEvent)
stream_id_pattern = re.compile(r"^(?:\$|\d+-\d+)$")
SESSION_REVALIDATION_SECONDS = 60


async def _principal(session_token: str | None) -> Principal | None:
    if not session_token:
        return None
    async with get_postgres_context().acquire() as session:
        return await get_session_principal(session, session_token)


def _origin_allowed(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    if not origin:
        return True
    parsed = urlsplit(origin)
    return parsed.scheme in {
        "http",
        "https",
    } and parsed.netloc == websocket.headers.get("host")


@router.websocket("/events")
async def events(websocket: WebSocket, after: str = "$") -> None:
    if not _origin_allowed(websocket):
        await websocket.close(code=4403)
        return
    session_token = websocket.cookies.get("session_token")
    principal = await _principal(session_token)
    if principal is None:
        await websocket.close(code=4401)
        return
    if not stream_id_pattern.fullmatch(after):
        await websocket.close(code=4400)
        return

    await websocket.accept()
    redis = get_redis_context()
    last_id = after
    revalidate_at = time.monotonic() + SESSION_REVALIDATION_SECONDS
    receiver = asyncio.create_task(websocket.receive())
    reader: asyncio.Task | None = None
    try:
        while True:
            reader = asyncio.create_task(
                redis.read_stream(EVENT_STREAM, last_id),
            )
            done, _ = await asyncio.wait(
                {receiver, reader},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if receiver in done:
                message = receiver.result()
                if message["type"] == "websocket.disconnect":
                    reader.cancel()
                    await asyncio.gather(reader, return_exceptions=True)
                    break
                receiver = asyncio.create_task(websocket.receive())
            if reader not in done:
                await reader
            if time.monotonic() >= revalidate_at:
                principal = await _principal(session_token)
                if principal is None:
                    await websocket.close(code=4401)
                    break
                revalidate_at = time.monotonic() + SESSION_REVALIDATION_SECONDS
            for entry in reader.result():
                last_id = entry.stream_id
                try:
                    event = event_adapter.validate_python(json.loads(entry.payload))
                except (json.JSONDecodeError, ValidationError):
                    continue
                if not can_receive_event(principal, event):
                    continue
                await websocket.send_text(
                    StreamEvent(
                        stream_id=entry.stream_id, event=event
                    ).model_dump_json(),
                )
    except WebSocketDisconnect:
        pass
    finally:
        receiver.cancel()
        if reader is not None:
            reader.cancel()
        await asyncio.gather(
            receiver,
            *(task for task in (reader,) if task is not None),
            return_exceptions=True,
        )
