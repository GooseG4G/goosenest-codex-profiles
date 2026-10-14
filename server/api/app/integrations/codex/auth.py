import asyncio
import base64
import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID, uuid4

from settings import get_settings

ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
CODE = re.compile(r"\b[A-Z0-9]{4,6}-[A-Z0-9]{4,6}\b")
URL = re.compile(r"https://auth\.openai\.com/[^\s\x1b]+")


@dataclass
class DeviceFlow:
    uid: UUID
    profile_id: UUID
    codex_home: Path
    one_time_code: str
    verification_url: str
    process: asyncio.subprocess.Process
    created_at: float
    error: str = ""
    committed: bool = False


class CodexDeviceAuth:
    def __init__(self) -> None:
        self._flows: dict[UUID, DeviceFlow] = {}

    async def start(self) -> DeviceFlow:
        settings = get_settings()
        uid, profile_id = uuid4(), uuid4()
        home = Path(settings.codex_profiles_root).resolve() / str(profile_id)
        home.mkdir(parents=True, exist_ok=False)
        env = os.environ.copy()
        env["CODEX_HOME"] = str(home)
        process = await asyncio.create_subprocess_exec(
            settings.codex_executable,
            "login",
            "--device-auth",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        output = ""
        deadline = time.monotonic() + 20
        assert process.stdout is not None
        while time.monotonic() < deadline:
            try:
                chunk = await asyncio.wait_for(process.stdout.read(256), timeout=1)
            except asyncio.TimeoutError:
                if process.returncode is not None:
                    break
                continue
            if not chunk:
                break
            output += ANSI.sub("", chunk.decode(errors="replace"))
            code, url = CODE.search(output), URL.search(output)
            if code and url:
                flow = DeviceFlow(
                    uid,
                    profile_id,
                    home,
                    code.group(0),
                    url.group(0),
                    process,
                    time.monotonic(),
                )
                self._flows[uid] = flow
                return flow
        process.terminate()
        await process.wait()
        raise RuntimeError(output.strip() or "Codex did not return a device code")

    def get(self, uid: UUID) -> DeviceFlow | None:
        return self._flows.get(uid)

    def remove(self, uid: UUID) -> None:
        self._flows.pop(uid, None)


device_auth = CodexDeviceAuth()


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
