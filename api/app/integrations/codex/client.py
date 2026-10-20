from types import TracebackType
from typing import Optional, Self

import httpx

from .providers import get_codex_settings
from .tokens import ensure_fresh
from .errors import CodexAuthenticationError


class CodexBackendClient:
    def __init__(self, codex_home: str) -> None:
        self.codex_home = codex_home
        self.client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> Self:
        try:
            token, account_id = await ensure_fresh(self.codex_home)
        except (OSError, ValueError) as error:
            raise CodexAuthenticationError(str(error)) from error
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "codex-cli",
        }
        if account_id:
            headers["ChatGPT-Account-Id"] = account_id
        self.client = httpx.AsyncClient(
            base_url=get_codex_settings().backend_url,
            headers=headers,
            timeout=httpx.Timeout(20),
            follow_redirects=False,
        )

        return self

    async def __aexit__(
        self,
        exc_type: Optional[type[BaseException]],
        exc_value: Optional[BaseException],
        traceback: Optional[TracebackType],
    ) -> None:
        if self.client:
            await self.client.aclose()
        self.client = None

    async def get(self, path: str) -> bytes:
        if not self.client:
            raise RuntimeError("Codex backend client is not open")
        response = await self.client.get(path)
        if response.status_code == 401:
            raise CodexAuthenticationError("Codex access token was rejected")
        response.raise_for_status()

        return response.content

    async def post(self, path: str, payload: dict[str, str]) -> bytes:
        if not self.client:
            raise RuntimeError("Codex backend client is not open")
        response = await self.client.post(path, json=payload)
        if response.status_code == 401:
            raise CodexAuthenticationError("Codex access token was rejected")
        response.raise_for_status()

        return response.content
