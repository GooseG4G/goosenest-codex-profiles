"""Native Codex app-server WebSocket transport.

This module is intentionally independent from the legacy Responses HTTP
client. It owns only JSON-RPC framing and lifecycle; profile selection and
lease management remain in the response route.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Mapping
from typing import Any, Protocol

import websockets
from websockets.asyncio.client import ClientConnection


class AppServerProtocolError(RuntimeError):
    pass


class AppServerTransportProtocol(Protocol):
    async def call(self, method: str, params: Mapping[str, Any]) -> dict[str, Any]: ...

    async def call_stream(
        self, method: str, params: Mapping[str, Any]
    ) -> AsyncIterator[dict[str, Any]]: ...


def responses_to_app_server_params(
    body: bytes, *, cwd: str | None = None
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Translate provider Responses JSON into thread/turn app-server params."""
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AppServerProtocolError("Responses body must be valid JSON") from error
    if not isinstance(payload, dict):
        raise AppServerProtocolError("Responses body must be an object")
    thread: dict[str, Any] = {}
    if cwd:
        thread["cwd"] = cwd
    for key in ("model", "sandbox", "approvalPolicy", "personality"):
        if key in payload:
            thread[key] = payload[key]
    turn: dict[str, Any] = {"input": payload.get("input", [])}
    for key in ("model", "effort", "outputSchema", "collaborationMode"):
        if key in payload:
            turn[key] = payload[key]
    return thread, turn


def rpc_request(request_id: int, method: str, params: Mapping[str, Any]) -> str:
    return json.dumps(
        {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params},
        separators=(",", ":"),
    )


class AppServerTransport:
    def __init__(self, url: str, token: str | None = None) -> None:
        self._url = url
        self._token = token
        self._socket: ClientConnection | None = None
        self._next_id = 1

    async def connect(self) -> None:
        headers = {"Authorization": f"Bearer {self._token}"} if self._token else None
        self._socket = await websockets.connect(self._url, additional_headers=headers)
        await self.call("initialize", {"clientInfo": {"name": "goosenest-gateway"}})

    async def close(self) -> None:
        if self._socket is not None:
            await self._socket.close()
            self._socket = None

    async def call(self, method: str, params: Mapping[str, Any]) -> dict[str, Any]:
        socket = self._socket
        if socket is None:
            raise RuntimeError("app-server transport is not connected")
        request_id = self._next_id
        self._next_id += 1
        await socket.send(rpc_request(request_id, method, params))
        async for message in socket:
            payload = json.loads(message)
            if payload.get("id") != request_id:
                continue
            if "error" in payload:
                raise AppServerProtocolError(str(payload["error"]))
            return payload.get("result", {})
        raise AppServerProtocolError("app-server closed before response")

    async def events(self) -> AsyncIterator[dict[str, Any]]:
        socket = self._socket
        if socket is None:
            raise RuntimeError("app-server transport is not connected")
        async for message in socket:
            yield json.loads(message)


class ResponsesAppServerSession:
    """Maps one provider Responses request to one app-server thread/turn."""

    def __init__(self, transport: AppServerTransportProtocol) -> None:
        self.transport = transport
        self.thread_id: str | None = None

    async def start_thread(self, params: Mapping[str, Any]) -> dict[str, Any]:
        result = await self.transport.call("thread/start", params)
        thread = result.get("thread") if isinstance(result, dict) else None
        if isinstance(thread, dict) and isinstance(thread.get("id"), str):
            self.thread_id = thread["id"]
        return result

    async def resume_thread(self, thread_id: str, params: Mapping[str, Any]) -> dict[str, Any]:
        result = await self.transport.call(
            "thread/resume", {"threadId": thread_id, **dict(params)}
        )
        self.thread_id = thread_id
        return result

    async def start_turn(self, params: Mapping[str, Any]) -> dict[str, Any]:
        if not self.thread_id:
            raise AppServerProtocolError("thread must be started before turn")
        return await self.transport.call(
            "turn/start", {"threadId": self.thread_id, **dict(params)}
        )

    async def turn_sse(self, params: Mapping[str, Any]) -> AsyncIterator[bytes]:
        """Start a turn and expose app-server notifications as SSE frames."""
        if not self.thread_id:
            raise AppServerProtocolError("thread must be started before turn")
        async for message in self.transport.call_stream(
            "turn/start", {"threadId": self.thread_id, **dict(params)}
        ):
            yield sse_event(message)


def sse_event(message: Mapping[str, Any]) -> bytes:
    """Encode an app-server notification as provider-compatible SSE."""
    event = message.get("method", "message")
    payload = json.dumps(message, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n".encode()
