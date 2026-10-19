from pathlib import Path
from typing import Any

from .app_server_pool import get_codex_app_server_pool


class CodexUsageError(RuntimeError):
    pass


class CodexAuthenticationError(CodexUsageError):
    pass


def codex_error(message: str) -> CodexUsageError:
    normalized = message.casefold()
    if any(
        marker in normalized
        for marker in (
            "401 unauthorized",
            "token_revoked",
            "invalidated oauth token",
            "not authenticated",
        )
    ):
        return CodexAuthenticationError(message)
    return CodexUsageError(message)


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


def _normalize_plan(result: object) -> str | None:
    if not isinstance(result, dict):
        raise CodexUsageError("Codex returned an invalid usage response")
    limits_by_id = result.get("rateLimitsByLimitId")
    snapshot = limits_by_id.get("codex") if isinstance(limits_by_id, dict) else None
    if not isinstance(snapshot, dict):
        snapshot = result.get("rateLimits")
    if not isinstance(snapshot, dict):
        raise CodexUsageError("Codex did not return account limits")
    value = snapshot.get("planType")
    return value.strip() if isinstance(value, str) and value.strip() else None


async def _call_codex(
    codex_home: str,
    method: str,
    params: dict[str, Any],
) -> object:
    home = Path(codex_home).resolve()
    if not (home / "auth.json").is_file():
        raise CodexAuthenticationError("Codex profile is not authenticated")

    pool = get_codex_app_server_pool()
    try:
        async with pool.session(str(home)) as app_server:
            return await app_server.call(method, params)
    except TimeoutError as error:
        raise CodexUsageError("Timed out while reading Codex usage limits") from error
    except RuntimeError as error:
        raise codex_error(str(error)) from error
    finally:
        # Celery currently wraps each task in asyncio.run(); do not leave
        # subprocesses attached to a loop that is about to be destroyed.
        await pool.close()


async def read_codex_usage(codex_home: str) -> dict[str, Any]:
    result = await _call_codex(
        codex_home,
        "account/rateLimits/read",
        {"excludeResetCreditDetails": False},
    )
    return _normalize_result(result)


async def read_codex_plan(codex_home: str) -> str | None:
    result = await _call_codex(
        codex_home,
        "account/rateLimits/read",
        {"excludeResetCreditDetails": True},
    )
    return _normalize_plan(result)


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
