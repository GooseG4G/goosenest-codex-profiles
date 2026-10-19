import asyncio
import json

import pytest

from integrations.codex.app_server_pool import AppServerSession, _Runtime


@pytest.mark.asyncio
async def test_call_stream_keeps_notifications(monkeypatch) -> None:
    class Writer:
        def write(self, value):
            self.value = value

        async def drain(self):
            return None

    class Reader:
        def __init__(self):
            self.lines = iter([
                b'{"method":"turn/started","params":{}}\n',
                b'{"id":1,"result":{}}\n',
            ])

        async def readline(self):
            return next(self.lines, b"")

    class Process:
        stdin = Writer()
        stdout = Reader()

    runtime = _Runtime(Process(), asyncio.Lock())  # type: ignore[arg-type]
    session = AppServerSession(runtime)
    events = [event async for event in session.call_stream("turn/start", {})]
    assert events == [{"method": "turn/started", "params": {}}]
