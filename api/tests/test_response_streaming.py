import hashlib
import json

import httpx
import pytest
from api.v1.response.response import (
    _response_affinity_keys_from_sse,
    _send,
    _session_key,
)
from api.v1.response.streaming import classify_failure, probe_stream


class ByteStream(httpx.AsyncByteStream):
    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks

    async def __aiter__(self):
        for chunk in self.chunks:
            yield chunk


class CapturingClient:
    def __init__(self) -> None:
        self.request: httpx.Request | None = None

    def build_request(self, method, url, **kwargs):
        self.request = httpx.Request(method, url, **kwargs)
        return self.request

    async def send(self, request, *, stream):
        assert stream
        return httpx.Response(200, request=request)


def frame(value: dict) -> bytes:
    return b"data: " + json.dumps(value).encode() + b"\n\n"


def test_session_key_prefers_explicit_chat_header() -> None:
    request = httpx.Request("POST", "http://test", headers={"x-chat-id": "chat-7"})

    assert _session_key(request, b"{}") == hashlib.sha256(
        b"header:x-chat-id:chat-7"
    ).hexdigest()


def test_session_key_uses_conversation_from_body() -> None:
    request = httpx.Request("POST", "http://test")

    assert _session_key(request, b'{"conversation_id":"conv-7"}') == (
        hashlib.sha256(b"body:conversation_id:conv-7").hexdigest()
    )


def test_session_key_does_not_pin_unidentified_chats_to_a_device() -> None:
    request = httpx.Request("POST", "http://test")

    assert _session_key(request, b"{}") != _session_key(request, b"{}")


def test_session_key_uses_official_conversation_fields() -> None:
    request = httpx.Request("POST", "http://test")

    conversation = _session_key(request, b'{"conversation":"conv_7"}')
    previous = _session_key(request, b'{"previous_response_id":"resp_7"}')

    assert conversation == hashlib.sha256(b"body:conversation:conv_7").hexdigest()
    assert previous == hashlib.sha256(
        b"body:previous_response_id:resp_7"
    ).hexdigest()


def test_prompt_cache_key_is_not_used_as_chat_identity() -> None:
    request = httpx.Request("POST", "http://test")
    body = b'{"prompt_cache_key":"same-user"}'

    assert _session_key(request, body) != _session_key(request, body)


def test_response_id_becomes_continuation_affinity_alias() -> None:
    payload = frame({"type": "response.created", "response": {"id": "resp_7"}})

    assert _response_affinity_keys_from_sse(payload) == {
        hashlib.sha256(b"body:previous_response_id:resp_7").hexdigest()
    }


@pytest.mark.asyncio
async def test_send_uses_a_stable_upstream_header_contract() -> None:
    client = CapturingClient()
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
        },
    )

    await _send(
        client,  # type: ignore[arg-type]
        "https://upstream.example/responses",
        b"{}",
        request,
        "oauth-token",
        "pool-account",
    )

    assert client.request is not None
    assert client.request.headers["authorization"] == "Bearer oauth-token"
    assert client.request.headers["chatgpt-account-id"] == "pool-account"
    assert "openai-beta" not in client.request.headers
    assert "x-session-id" not in client.request.headers
    assert "cookie" not in client.request.headers
    assert client.request.headers.get("connection") != "keep-alive"
    assert client.request.headers["user-agent"] == "codex-cli"


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


@pytest.mark.asyncio
async def test_probe_detects_failed_response_before_content() -> None:
    payload = frame(
        {
            "type": "response.failed",
            "response": {
                "error": {"code": "server_error", "message": "Try again"}
            },
        }
    )
    response = httpx.Response(200, stream=ByteStream([payload]))

    probe = await probe_stream(response)

    assert probe.prefix == payload
    assert probe.failure is not None
    assert probe.failure.retryable


@pytest.mark.asyncio
async def test_probe_stops_at_first_content_and_preserves_bytes() -> None:
    created = frame({"type": "response.created"})
    content = frame({"type": "response.output_text.delta", "delta": "hello"})
    response = httpx.Response(200, stream=ByteStream([created, content]))

    probe = await probe_stream(response)

    assert probe.prefix == created + content
    assert probe.failure is None
