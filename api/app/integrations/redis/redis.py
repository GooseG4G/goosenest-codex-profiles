import json

from pydantic import BaseModel
from redis.asyncio import Redis

from .settings import RedisSettings


class RedisStreamEntry(BaseModel):
    stream_id: str
    payload: str


class RedisContext:
    def __init__(self, settings: RedisSettings) -> None:
        self._settings = settings
        self._client: Redis | None = None

    @property
    def settings(self) -> RedisSettings:
        return self._settings

    @property
    def is_open(self) -> bool:
        return self._client is not None

    async def open(self) -> None:
        if self._client is not None:
            return
        client = Redis.from_url(self._settings.url, decode_responses=True)
        await client.ping()
        self._client = client

    async def close(self) -> None:
        client = self._client
        self._client = None
        if client is not None:
            await client.aclose()

    def _require_client(self) -> Redis:
        if self._client is None:
            raise RuntimeError("RedisContext is not open")
        return self._client

    async def append_model(
        self,
        stream: str,
        model: BaseModel,
        *,
        max_length: int,
    ) -> str:
        stream_id = await self._require_client().xadd(
            stream,
            {
                "payload": json.dumps(
                    model.model_dump(mode="json"), separators=(",", ":")
                )
            },
            maxlen=max_length,
            approximate=True,
        )
        return str(stream_id)

    async def claim(self, key: str, value: str, *, ttl_seconds: int) -> bool:
        claimed = await self._require_client().set(
            key,
            value,
            ex=ttl_seconds,
            nx=True,
        )
        return bool(claimed)

    async def read_stream(
        self,
        stream: str,
        after: str,
        *,
        count: int = 50,
        block_milliseconds: int = 15_000,
    ) -> list[RedisStreamEntry]:
        rows = await self._require_client().xread(
            {stream: after},
            count=count,
            block=block_milliseconds,
        )
        return [
            RedisStreamEntry(stream_id=stream_id, payload=fields["payload"])
            for _, entries in rows
            for stream_id, fields in entries
            if "payload" in fields
        ]
