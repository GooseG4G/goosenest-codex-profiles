import hashlib
import json
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime

import httpx
import pytest
from api.v1.response.affinity import (
    request_affinity_key,
    response_affinity_keys,
)
from api.v1.response.response import _retry_after_seconds
from api.v1.response.streaming import classify_failure, probe_stream
from api.v1.response.upstream import downstream_headers, upstream_headers


class ByteStream(httpx.AsyncByteStream):
    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks

    async def __aiter__(self):
        for chunk in self.chunks:
            yield chunk


def frame(value: dict) -> bytes:
    return b"data: " + json.dumps(value).encode() + b"\n\n"


def test_session_key_prefers_explicit_chat_header() -> None:
    request = httpx.Request("POST", "http://test", headers={"x-chat-id": "chat-7"})

    assert (
        request_affinity_key(request, b"{}")
        == hashlib.sha256(b"header:x-chat-id:chat-7").hexdigest()
    )


def test_session_key_uses_conversation_from_body() -> None:
    request = httpx.Request("POST", "http://test")

    assert request_affinity_key(request, b'{"conversation_id":"conv-7"}') == (
        hashlib.sha256(b"body:conversation_id:conv-7").hexdigest()
    )


def test_session_key_does_not_pin_unidentified_chats_to_a_device() -> None:
    request = httpx.Request("POST", "http://test")

    assert request_affinity_key(request, b"{}") is None


def test_session_key_uses_official_conversation_fields() -> None:
    request = httpx.Request("POST", "http://test")

    conversation = request_affinity_key(request, b'{"conversation":"conv_7"}')
    previous = request_affinity_key(request, b'{"previous_response_id":"resp_7"}')

    assert conversation == hashlib.sha256(b"body:conversation:conv_7").hexdigest()
    assert previous == hashlib.sha256(b"body:previous_response_id:resp_7").hexdigest()


def test_prompt_cache_key_is_not_used_as_chat_identity() -> None:
    request = httpx.Request("POST", "http://test")
    body = b'{"prompt_cache_key":"same-user"}'

    assert request_affinity_key(request, body) is None


def test_response_id_becomes_continuation_affinity_alias() -> None:
    payload = frame({"type": "response.created", "response": {"id": "resp_7"}})

    assert response_affinity_keys(payload) == {
        hashlib.sha256(b"body:previous_response_id:resp_7").hexdigest()
    }


def test_send_uses_a_stable_upstream_header_contract() -> None:
    request = httpx.Request(
        "POST",
        "http://proxy/responses",
        headers={
            "Authorization": "Bearer device-secret",
            "ChatGPT-Account-Id": "client-account",
            "OpenAI-Beta": "responses=v1",
            "X-Session-Id": "chat-7",
            "Connection": "keep-alive",
            "Cookie": "private=value",
            "X-Client-Request-Id": "request-7",
            "Idempotency-Key": "operation-7",
        },
    )

    headers = httpx.Headers(upstream_headers(request, "oauth-token", "pool-account"))

    assert headers["authorization"] == "Bearer oauth-token"
    assert headers["chatgpt-account-id"] == "pool-account"
    assert headers["x-client-request-id"] == "request-7"
    assert headers["idempotency-key"] == "operation-7"
    assert "openai-beta" not in headers
    assert "x-session-id" not in headers
    assert "cookie" not in headers
    assert "connection" not in headers
    assert headers["user-agent"] == "codex-cli"


def test_response_header_contract_strips_transport_state_and_cookies() -> None:
    headers = downstream_headers(
        httpx.Headers(
            {
                "Connection": "keep-alive",
                "Content-Length": "99",
                "Set-Cookie": "session=private",
                "X-OAI-Request-Id": "upstream-7",
                "Retry-After": "30",
                "Content-Type": "text/event-stream",
            }
        )
    )

    assert "connection" not in headers
    assert "content-length" not in headers
    assert "set-cookie" not in headers
    assert headers["x-oai-request-id"] == "upstream-7"
    assert headers["retry-after"] == "30"
    assert headers["content-type"] == "text/event-stream"


def test_capacity_error_is_retryable() -> None:
    failure = classify_failure(
        {
            "type": "error",
            "code": "server_is_overloaded",
            "message": "Selected model is at capacity. Please try a different model.",
        }
    )

    assert failure is not None
    assert failure.retryable
    assert failure.kind == "model_capacity"


def test_invalid_request_is_not_retryable() -> None:
    failure = classify_failure(
        {"type": "error", "code": "invalid_request", "message": "Bad input"}
    )

    assert failure is not None
    assert not failure.retryable


def test_retry_after_accepts_delta_seconds_and_http_date() -> None:
    retry_at = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=120))

    assert _retry_after_seconds("15") == 15
    assert 118 <= _retry_after_seconds(retry_at) <= 120
    assert _retry_after_seconds("invalid") == 60


@pytest.mark.asyncio
async def test_probe_detects_failed_response_before_content() -> None:
    payload = frame(
        {
            "type": "response.failed",
            "response": {"error": {"code": "server_error", "message": "Try again"}},
        }
    )
    response = httpx.Response(200, stream=ByteStream([payload]))

    probe = await probe_stream(response)

    assert probe.prefix == payload
    assert probe.failure is not None
    assert probe.failure.retryable


@pytest.mark.asyncio
async def test_probe_stops_at_created_event_to_minimize_first_byte_latency() -> None:
    created = frame({"type": "response.created"})
    content = frame({"type": "response.output_text.delta", "delta": "hello"})
    response = httpx.Response(200, stream=ByteStream([created, content]))

    probe = await probe_stream(response)

    assert probe.prefix == created
    assert probe.failure is None
