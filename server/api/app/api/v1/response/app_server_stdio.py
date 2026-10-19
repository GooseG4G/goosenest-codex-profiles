"""Adapter from the profile app-server pool to the Responses session API."""

from collections.abc import AsyncIterator, Mapping
from typing import Any

from integrations.codex.app_server_pool import AppServerSession


class StdioAppServerTransport:
    def __init__(self, session: AppServerSession) -> None:
        self._session = session

    async def call(self, method: str, params: Mapping[str, Any]) -> dict[str, Any]:
        result = await self._session.call(method, dict(params))
        return result if isinstance(result, dict) else {}

    async def call_stream(
        self, method: str, params: Mapping[str, Any]
    ) -> AsyncIterator[dict[str, Any]]:
        async for message in self._session.call_stream(method, dict(params)):
            yield message
