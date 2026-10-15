import asyncio
import json
import re

from api.v1.session.auth import Principal, get_session_principal
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from integrations.events import EVENT_STREAM
from integrations.postgres.providers import get_postgres_context
from integrations.redis.providers import get_redis_context
from pydantic import TypeAdapter, ValidationError

from .models import ServerEvent, StreamEvent

router = APIRouter(tags=["events"])
event_adapter = TypeAdapter(ServerEvent)
stream_id_pattern = re.compile(r"^(?:\$|\d+-\d+)$")


async def _principal(session_token: str | None) -> Principal | None:
    if not session_token:
        return None
    async with get_postgres_context().acquire() as session:
        return await get_session_principal(session, session_token)


@router.websocket("/events")
async def events(websocket: WebSocket, after: str = "$") -> None:
    principal = await _principal(websocket.cookies.get("session_token"))
    if principal is None:
        await websocket.close(code=4401)
        return
    if principal.role != "administrator":
        await websocket.close(code=4403)
        return
    if not stream_id_pattern.fullmatch(after):
        await websocket.close(code=4400)
        return

    await websocket.accept()
    redis = get_redis_context()
    last_id = after
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
            for entry in reader.result():
                last_id = entry.stream_id
                try:
                    event = event_adapter.validate_python(json.loads(entry.payload))
                except (json.JSONDecodeError, ValidationError):
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
