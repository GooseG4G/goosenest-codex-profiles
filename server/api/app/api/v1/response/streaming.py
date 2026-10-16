from __future__ import annotations

import json
from dataclasses import dataclass
from typing import AsyncIterator

import httpx

_START_EVENTS = {
    "response.created",
    "response.output_text.delta",
    "response.refusal.delta",
    "response.function_call_arguments.delta",
    "response.custom_tool_call_input.delta",
    "response.completed",
    "response.incomplete",
}


@dataclass(frozen=True)
class StreamFailure:
    code: str | None
    message: str
    retryable: bool
    kind: str


@dataclass
class StreamProbe:
    prefix: bytes
    iterator: AsyncIterator[bytes]
    failure: StreamFailure | None = None


def _event_payload(frame: bytes) -> dict | None:
    data = []
    for line in frame.splitlines():
        if line.startswith(b"data:"):
            data.append(line[5:].lstrip())
    if not data or data == [b"[DONE]"]:
        return None
    try:
        value = json.loads(b"\n".join(data))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return value if isinstance(value, dict) else None


def classify_failure(event: dict) -> StreamFailure | None:
    event_type = event.get("type")
    error = event.get("error")
    if event_type == "response.failed":
        response = event.get("response")
        error = response.get("error") if isinstance(response, dict) else error
    if event_type not in {"error", "response.failed"}:
        return None
    error = error if isinstance(error, dict) else event
    code = error.get("code") if isinstance(error.get("code"), str) else None
    message = error.get("message")
    message = message if isinstance(message, str) else "Upstream stream failed"
    normalized = f"{code or ''} {message}".lower()
    rate_limit = any(marker in normalized for marker in ("rate_limit", "slow_down"))
    overloaded = any(
        marker in normalized
        for marker in (
            "capacity",
            "overload",
            "server_error",
            "temporarily_unavailable",
        )
    )
    kind = "rate_limit" if rate_limit else "model_capacity" if overloaded else "other"
    return StreamFailure(
        code=code,
        message=message,
        retryable=rate_limit or overloaded,
        kind=kind,
    )


async def probe_stream(
    response: httpx.Response, *, max_bytes: int = 65536
) -> StreamProbe:
    iterator = response.aiter_raw()
    buffered = bytearray()
    scan_offset = 0
    async for chunk in iterator:
        buffered.extend(chunk)
        while True:
            boundary = buffered.find(b"\n\n", scan_offset)
            separator_size = 2
            if boundary < 0:
                boundary = buffered.find(b"\r\n\r\n", scan_offset)
                separator_size = 4
            if boundary < 0:
                break
            end = boundary + separator_size
            event = _event_payload(bytes(buffered[scan_offset:end]))
            scan_offset = end
            if event is None:
                continue
            failure = classify_failure(event)
            if failure is not None:
                return StreamProbe(bytes(buffered), iterator, failure)
            if event.get("type") in _START_EVENTS:
                return StreamProbe(bytes(buffered), iterator)
        if len(buffered) >= max_bytes:
            return StreamProbe(bytes(buffered), iterator)
    return StreamProbe(bytes(buffered), iterator)
