from functools import lru_cache

import httpx
from fastapi import Request

from .settings import get_responses_settings

_FORWARDED_HEADERS = ("thread-id", "session-id", "x-chat-id", "x-session-id")
_RESPONSE_HEADERS_TO_STRIP = {
    "connection",
    "content-length",
    "date",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "server",
    "set-cookie",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


def upstream_headers(
    request: Request,
    token: str,
    account_id: str | None,
) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": request.headers.get("content-type", "application/json"),
        "Accept": request.headers.get("accept", "text/event-stream"),
        "Accept-Encoding": "identity",
        "User-Agent": "codex-cli",
    }
    if account_id:
        headers["ChatGPT-Account-Id"] = account_id
    for name in _FORWARDED_HEADERS:
        value = request.headers.get(name)
        if value and len(value) <= 512 and value.isascii():
            headers[name] = value
    return headers


def downstream_headers(headers: httpx.Headers) -> dict[str, str]:
    return {
        name: value
        for name, value in headers.items()
        if name.lower() not in _RESPONSE_HEADERS_TO_STRIP
    }


class ResponsesUpstream:
    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None

    async def open(self) -> None:
        if self._client is not None:
            return
        settings = get_responses_settings()
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(
                settings.request_timeout,
                connect=min(settings.request_timeout, 15.0),
                pool=min(settings.request_timeout, 15.0),
            ),
            limits=httpx.Limits(
                max_connections=100,
                max_keepalive_connections=20,
                keepalive_expiry=30.0,
            ),
        )

    async def close(self) -> None:
        client = self._client
        self._client = None
        if client is not None:
            await client.aclose()

    async def send(
        self,
        url: str,
        body: bytes,
        request: Request,
        token: str,
        account_id: str | None,
    ) -> httpx.Response:
        client = self._client
        if client is None:
            raise RuntimeError("ResponsesUpstream is not open")
        upstream_request = client.build_request(
            "POST",
            url,
            content=body,
            headers=upstream_headers(request, token, account_id),
        )
        return await client.send(upstream_request, stream=True)


@lru_cache(maxsize=1)
def get_responses_upstream() -> ResponsesUpstream:
    return ResponsesUpstream()
