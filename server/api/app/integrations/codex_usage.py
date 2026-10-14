import asyncio
import json
import os
from pathlib import Path
from typing import Any

from app.api.v1.providers import get_api_settings


class CodexUsageError(RuntimeError):
    pass


def _normalize_window(value: object) -> dict[str, int | float | None] | None:
    if not isinstance(value, dict):
        return None
    used = value.get("usedPercent")
    if not isinstance(used, (int, float)):
        return None
    duration = value.get("windowDurationMins")
    resets_at = value.get("resetsAt")
    return {
        "usedPercent": max(0, min(100, round(float(used)))),
        "windowDurationMins": int(duration)
        if isinstance(duration, (int, float))
        else None,
        "resetsAt": int(resets_at) if isinstance(resets_at, (int, float)) else None,
    }


def _normalize_result(result: object) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise CodexUsageError("Codex returned an invalid usage response")
    limits_by_id = result.get("rateLimitsByLimitId")
    snapshot = limits_by_id.get("codex") if isinstance(limits_by_id, dict) else None
    if not isinstance(snapshot, dict):
        snapshot = result.get("rateLimits")
    if not isinstance(snapshot, dict):
        raise CodexUsageError("Codex did not return usage limits")

    usage: dict[str, Any] = {}
    for key in ("primary", "secondary"):
        window = _normalize_window(snapshot.get(key))
        if window:
            usage[key] = window
    if not usage:
        raise CodexUsageError("Codex returned no usage windows")
    if isinstance(snapshot.get("planType"), str):
        usage["planType"] = snapshot["planType"]
    if isinstance(result.get("ordinaryUsageAllowed"), bool):
        usage["ordinaryUsageAllowed"] = result["ordinaryUsageAllowed"]

    reset_credits = result.get("rateLimitResetCredits")
    if isinstance(reset_credits, dict):
        usage["rateLimitResetCredits"] = reset_credits
    return usage


async def _call_codex(
    codex_home: str,
    method: str,
    params: dict[str, Any],
) -> object:
    settings = get_api_settings()
    home = Path(codex_home).resolve()
    if not (home / "auth.json").is_file():
        raise CodexUsageError("Codex profile is not authenticated")

    environment = os.environ.copy()
    environment["CODEX_HOME"] = str(home)
    process = await asyncio.create_subprocess_exec(
        settings.codex_executable,
        "app-server",
        "--stdio",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=environment,
    )
    assert process.stdin is not None
    assert process.stdout is not None
    assert process.stderr is not None

    async def send(message: dict[str, Any]) -> None:
        process.stdin.write(
            (json.dumps(message, separators=(",", ":")) + "\n").encode()
        )
        await process.stdin.drain()

    try:
        await send(
            {
                "id": 1,
                "method": "initialize",
                "params": {
                    "clientInfo": {
                        "name": "goosenest-codex-profiles",
                        "title": "Goosenest Codex Profiles",
                        "version": "0.1.0",
                    },
                    "capabilities": {"experimentalApi": True},
                },
            }
        )
        async with asyncio.timeout(20):
            initialized = False
            while line := await process.stdout.readline():
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if message.get("id") == 1 and not initialized:
                    if message.get("error"):
                        raise CodexUsageError(
                            message["error"].get(
                                "message", "Codex initialization failed"
                            )
                        )
                    initialized = True
                    await send({"method": "initialized"})
                    await send(
                        {
                            "id": 2,
                            "method": method,
                            "params": params,
                        }
                    )
                elif message.get("id") == 2:
                    if message.get("error"):
                        raise CodexUsageError(
                            message["error"].get(
                                "message", "Could not read usage limits"
                            )
                        )
                    return message.get("result")
            stderr = (await process.stderr.read()).decode(errors="replace").strip()
            raise CodexUsageError(
                stderr[-1000:] or "Codex app-server stopped before returning usage"
            )
    except TimeoutError as error:
        raise CodexUsageError("Timed out while reading Codex usage limits") from error
    finally:
        if not process.stdin.is_closing():
            process.stdin.close()
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=2)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()


async def read_codex_usage(codex_home: str) -> dict[str, Any]:
    result = await _call_codex(
        codex_home,
        "account/rateLimits/read",
        {"excludeResetCreditDetails": False},
    )
    return _normalize_result(result)


async def consume_codex_usage_reset(
    codex_home: str,
    credit_id: str,
    idempotency_key: str,
) -> str:
    result = await _call_codex(
        codex_home,
        "account/rateLimitResetCredit/consume",
        {"creditId": credit_id, "idempotencyKey": idempotency_key},
    )
    if not isinstance(result, dict) or result.get("outcome") not in {
        "reset",
        "nothingToReset",
        "noCredit",
        "alreadyRedeemed",
    }:
        raise CodexUsageError("Codex returned an invalid reset outcome")
    return str(result["outcome"])
