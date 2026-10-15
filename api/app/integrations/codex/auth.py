import asyncio
import base64
import json
import os
import time
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from .models import DeviceFlow
from .providers import get_codex_settings


class CodexDeviceAuth:
    def __init__(self) -> None:
        self._flows: dict[UUID, DeviceFlow] = {}

    async def _write(self, flow: DeviceFlow, message: dict[str, Any]) -> None:
        if flow.process.stdin is None or flow.process.returncode is not None:
            raise RuntimeError("Codex app-server is not running")
        flow.process.stdin.write((json.dumps(message) + "\n").encode())
        await flow.process.stdin.drain()

    async def _request(
        self, flow: DeviceFlow, method: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        flow.request_id += 1
        request_id = flow.request_id
        future = asyncio.get_running_loop().create_future()
        flow.pending[request_id] = future
        try:
            await self._write(
                flow, {"id": request_id, "method": method, "params": params}
            )
            return await asyncio.wait_for(future, timeout=20)
        finally:
            flow.pending.pop(request_id, None)

    async def _read(self, flow: DeviceFlow) -> None:
        assert flow.process.stdout is not None
        while line := await flow.process.stdout.readline():
            try:
                message = json.loads(line)
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            if not isinstance(message, dict):
                continue
            request_id = message.get("id")
            if isinstance(request_id, int) and request_id in flow.pending:
                future = flow.pending[request_id]
                if "error" in message:
                    future.set_exception(
                        RuntimeError(self._rpc_error(message.get("error")))
                    )
                elif isinstance(message.get("result"), dict):
                    future.set_result(message["result"])
                else:
                    future.set_exception(RuntimeError("Invalid Codex RPC response"))
                continue
            if message.get("method") != "account/login/completed":
                continue
            params = message.get("params")
            if not isinstance(params, dict):
                flow.error = "Invalid Codex login completion event"
            elif flow.login_id and params.get("loginId") not in (None, flow.login_id):
                continue
            elif params.get("success") is True:
                flow.completed = True
            else:
                flow.error = str(params.get("error") or "Codex sign-in failed")
            flow.completion_event.set()
        if not flow.completed and not flow.error:
            flow.error = "Codex app-server stopped before sign-in completed"
        flow.completion_event.set()
        for future in flow.pending.values():
            if not future.done():
                future.set_exception(RuntimeError(flow.error))

    @staticmethod
    def _rpc_error(value: object) -> str:
        if isinstance(value, dict) and isinstance(value.get("message"), str):
            return value["message"]
        return str(value or "Codex RPC request failed")

    async def start(self, target_profile_id: UUID | None = None) -> DeviceFlow:
        settings = get_codex_settings()
        uid, profile_id = uuid4(), uuid4()
        home = Path(settings.profiles_root).resolve() / str(profile_id)
        home.mkdir(parents=True, mode=0o700, exist_ok=False)
        env = os.environ.copy()
        env["CODEX_HOME"] = str(home)
        process = await asyncio.create_subprocess_exec(
            settings.executable,
            "app-server",
            "--listen",
            "stdio://",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env=env,
        )
        flow = DeviceFlow(
            uid=uid,
            profile_id=profile_id,
            codex_home=home,
            one_time_code="",
            verification_url="",
            process=process,
            created_at=time.monotonic(),
            login_id="",
            target_profile_id=target_profile_id,
        )
        flow.reader_task = asyncio.create_task(self._read(flow))
        try:
            await self._request(
                flow,
                "initialize",
                {
                    "clientInfo": {
                        "name": "goosenest-codex-profiles",
                        "title": "Goosenest Codex Profiles",
                        "version": "1",
                    }
                },
            )
            await self._write(flow, {"method": "initialized"})
            result = await self._request(
                flow, "account/login/start", {"type": "chatgptDeviceCode"}
            )
            if result.get("type") != "chatgptDeviceCode":
                raise RuntimeError("Codex returned an unsupported login flow")
            flow.login_id = str(result["loginId"])
            flow.one_time_code = str(result["userCode"])
            flow.verification_url = str(result["verificationUrl"])
            self._flows[uid] = flow
            return flow
        except (KeyError, OSError, RuntimeError, asyncio.TimeoutError) as error:
            await self.stop(flow)
            raise RuntimeError(str(error) or "Codex did not start device sign-in") from error

    def get(self, uid: UUID) -> DeviceFlow | None:
        return self._flows.get(uid)

    def remove(self, uid: UUID) -> None:
        self._flows.pop(uid, None)

    async def cancel(self, flow: DeviceFlow) -> None:
        async with flow.lock:
            if flow.process.returncode is None and flow.login_id and not flow.completed:
                try:
                    await self._request(
                        flow, "account/login/cancel", {"loginId": flow.login_id}
                    )
                except (RuntimeError, asyncio.TimeoutError):
                    pass
            await self.stop(flow)

    async def stop(self, flow: DeviceFlow) -> None:
        if flow.process.returncode is None:
            try:
                flow.process.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(flow.process.wait(), timeout=2)
            except asyncio.TimeoutError:
                flow.process.kill()
                await flow.process.wait()
        reader_task = getattr(flow, "reader_task", None)
        if reader_task is not None and reader_task is not asyncio.current_task():
            try:
                await asyncio.wait_for(reader_task, timeout=1)
            except asyncio.TimeoutError:
                reader_task.cancel()


device_auth = CodexDeviceAuth()


def authenticated(auth_path: Path) -> bool:
    try:
        auth = json.loads(auth_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(auth, dict):
        return False
    tokens = auth.get("tokens")
    return isinstance(tokens, dict) and isinstance(tokens.get("access_token"), str)


def secure_credentials(auth_path: Path) -> None:
    auth_path.chmod(0o600)


def _jwt_claims(token: object) -> dict[str, object]:
    if not isinstance(token, str):
        return {}
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload)
        value = json.loads(decoded)
        return value if isinstance(value, dict) else {}
    except (IndexError, ValueError, TypeError, json.JSONDecodeError):
        return {}


def profile_identity(auth_path: Path, profile_id: UUID) -> str:
    try:
        auth = json.loads(auth_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        auth = {}
    tokens = auth.get("tokens") if isinstance(auth.get("tokens"), dict) else {}
    user = auth.get("user") if isinstance(auth.get("user"), dict) else {}
    claims = _jwt_claims(tokens.get("id_token") or auth.get("id_token"))
    openai_profile = claims.get("https://api.openai.com/profile")
    if not isinstance(openai_profile, dict):
        openai_profile = {}
    candidates = (
        auth.get("email"),
        auth.get("account_email"),
        user.get("email"),
        tokens.get("email"),
        claims.get("email"),
        openai_profile.get("email"),
        tokens.get("account_id"),
        auth.get("account_id"),
    )
    return next(
        (value for value in candidates if isinstance(value, str) and value.strip()),
        f"Codex {str(profile_id)[:8]}",
    )
