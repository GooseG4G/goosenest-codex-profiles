import json
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from integrations.codex.auth import (
    CodexDeviceAuth,
    authenticated,
    secure_credentials,
)
from integrations.codex.models import DeviceFlow


def test_authentication_is_ready_when_access_token_exists(tmp_path: Path) -> None:
    auth_path = tmp_path / "auth.json"
    auth_path.write_text(
        json.dumps({"tokens": {"access_token": "ready"}}), encoding="utf-8"
    )

    assert authenticated(auth_path) is True


@pytest.mark.parametrize(
    "payload",
    [None, {}, {"tokens": {}}, {"tokens": {"access_token": None}}],
)
def test_authentication_rejects_incomplete_credentials(
    tmp_path: Path, payload: object
) -> None:
    auth_path = tmp_path / "auth.json"
    if payload is not None:
        auth_path.write_text(json.dumps(payload), encoding="utf-8")

    assert authenticated(auth_path) is False


@pytest.mark.asyncio
async def test_stops_login_process_that_remains_alive_after_authentication() -> None:
    class Process:
        returncode: int | None = None
        terminated = False

        def terminate(self) -> None:
            self.terminated = True

        async def wait(self) -> int:
            self.returncode = -15
            return self.returncode

    process = Process()
    flow = SimpleNamespace(process=process)

    await CodexDeviceAuth().stop(flow)

    assert process.terminated is True
    assert process.returncode == -15


@pytest.mark.asyncio
async def test_completion_notification_is_authoritative(tmp_path: Path) -> None:
    reader = __import__("asyncio").StreamReader()
    reader.feed_data(
        (
            json.dumps(
                {
                    "method": "account/login/completed",
                    "params": {"loginId": "login-1", "success": True},
                }
            )
            + "\n"
        ).encode()
    )
    reader.feed_eof()
    flow = DeviceFlow(
        uid=uuid4(),
        profile_id=uuid4(),
        codex_home=tmp_path,
        one_time_code="CODE",
        verification_url="https://auth.openai.com/codex/device",
        process=SimpleNamespace(stdout=reader),
        created_at=0,
        login_id="login-1",
    )

    await CodexDeviceAuth()._read(flow)

    assert flow.completed is True
    assert flow.error == ""
    assert flow.completion_event.is_set()


def test_credentials_are_owner_only(tmp_path: Path) -> None:
    auth_path = tmp_path / "auth.json"
    auth_path.write_text("{}", encoding="utf-8")

    secure_credentials(auth_path)

    assert auth_path.stat().st_mode & 0o777 == 0o600
