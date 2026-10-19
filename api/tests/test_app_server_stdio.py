import pytest

from api.v1.response.app_server_stdio import StdioAppServerTransport


@pytest.mark.asyncio
async def test_stdio_adapter_delegates_calls() -> None:
    class Session:
        async def call(self, method, params):
            return {"method": method, "params": params}

        async def call_stream(self, method, params):
            yield {"method": method, "params": params}

    adapter = StdioAppServerTransport(Session())
    assert await adapter.call("thread/start", {}) == {
        "method": "thread/start", "params": {}
    }
    events = [event async for event in adapter.call_stream("turn/start", {})]
    assert events[0]["method"] == "turn/start"
