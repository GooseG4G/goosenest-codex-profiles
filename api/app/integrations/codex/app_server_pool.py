"""Per-profile app-server runtime ownership.

The pool prevents Responses and background usage tasks from opening competing
Codex processes against the same CODEX_HOME. A runtime is serialized per
profile; callers must keep the lease only for the duration of one RPC.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator



@dataclass
class _Runtime:
    process: asyncio.subprocess.Process
    lock: asyncio.Lock
    next_id: int = 1
    last_used: float = 0.0
    initialized: bool = False


class CodexAppServerPool:
    def __init__(self) -> None:
        self._runtimes: dict[str, _Runtime] = {}
        self._guard = asyncio.Lock()

    async def _runtime(self, home: Path) -> _Runtime:
        key = str(home)
        async with self._guard:
            current = self._runtimes.get(key)
            if current and current.process.returncode is None:
                return current
            env = os.environ.copy()
            env["CODEX_HOME"] = key
            from .providers import get_codex_settings

            settings = get_codex_settings()
            process = await asyncio.create_subprocess_exec(
                settings.executable, "app-server", "--stdio",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            runtime = _Runtime(process, asyncio.Lock())
            runtime.last_used = time.monotonic()
            self._runtimes[key] = runtime
            async with runtime.lock:
                session = AppServerSession(runtime)
                await session.call(
                    "initialize",
                    {"clientInfo": {
                        "name": "goosenest-codex-profiles",
                        "title": "Goosenest Codex Profiles",
                        "version": "0.1.0",
                    }, "capabilities": {"experimentalApi": True}},
                )
                if process.stdin is not None:
                    process.stdin.write(b'{"method":"initialized"}\n')
                    await process.stdin.drain()
                runtime.initialized = True
            return runtime

    @asynccontextmanager
    async def session(self, codex_home: str) -> AsyncIterator["AppServerSession"]:
        home = Path(codex_home).resolve()
        if not (home / "auth.json").is_file():
            raise RuntimeError("Codex profile is not authenticated")
        runtime = await self._runtime(home)
        async with runtime.lock:
            runtime.last_used = time.monotonic()
            yield AppServerSession(runtime)
            runtime.last_used = time.monotonic()

    async def reap_idle(self, idle_seconds: float = 300.0) -> None:
        """Stop runtimes that have been idle longer than the policy TTL."""
        now = time.monotonic()
        async with self._guard:
            stale = [
                (key, runtime)
                for key, runtime in self._runtimes.items()
                if not runtime.lock.locked()
                and runtime.process.returncode is None
                and now - runtime.last_used >= idle_seconds
            ]
            for key, runtime in stale:
                runtime.process.terminate()
                try:
                    await asyncio.wait_for(runtime.process.wait(), timeout=2)
                except asyncio.TimeoutError:
                    runtime.process.kill()
                    await runtime.process.wait()
                self._runtimes.pop(key, None)

    async def close(self) -> None:
        async with self._guard:
            runtimes = list(self._runtimes.values())
            self._runtimes.clear()
        for runtime in runtimes:
            if runtime.process.returncode is None:
                runtime.process.terminate()
                try:
                    await asyncio.wait_for(runtime.process.wait(), timeout=2)
                except asyncio.TimeoutError:
                    runtime.process.kill()
                    await runtime.process.wait()


class AppServerSession:
    def __init__(self, runtime: _Runtime) -> None:
        self._runtime = runtime

    async def call(self, method: str, params: dict[str, Any]) -> Any:
        process = self._runtime.process
        if process.stdin is None or process.stdout is None:
            raise RuntimeError("Codex app-server pipes are unavailable")
        request_id = self._runtime.next_id
        self._runtime.next_id += 1
        process.stdin.write((json.dumps({
            "id": request_id, "method": method, "params": params,
        }, separators=(",", ":")) + "\n").encode())
        await process.stdin.drain()
        while line := await process.stdout.readline():
            message = json.loads(line)
            if message.get("id") != request_id:
                continue
            if "error" in message:
                raise RuntimeError(str(message["error"]))
            return message.get("result")
        raise RuntimeError("Codex app-server stopped")

    async def call_stream(
        self, method: str, params: dict[str, Any]
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield notifications and finish after the matching RPC response."""
        process = self._runtime.process
        if process.stdin is None or process.stdout is None:
            raise RuntimeError("Codex app-server pipes are unavailable")
        request_id = self._runtime.next_id
        self._runtime.next_id += 1
        process.stdin.write((json.dumps({
            "id": request_id, "method": method, "params": params,
        }, separators=(",", ":")) + "\n").encode())
        await process.stdin.drain()
        while line := await process.stdout.readline():
            message = json.loads(line)
            if message.get("id") == request_id:
                if "error" in message:
                    raise RuntimeError(str(message["error"]))
                return
            if "method" in message:
                yield message
        raise RuntimeError("Codex app-server stopped during stream")


_POOLS: dict[int, CodexAppServerPool] = {}


def get_codex_app_server_pool() -> CodexAppServerPool:
    # asyncio subprocess transports are bound to their event loop. Celery
    # currently creates a loop per task, while the API has one lifespan loop;
    # never leak a runtime across those loop boundaries.
    loop = asyncio.get_running_loop()
    pool = _POOLS.get(id(loop))
    if pool is None:
        pool = CodexAppServerPool()
        _POOLS[id(loop)] = pool
    return pool
