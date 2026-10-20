import asyncio
from typing import Any

from ..client import CodexBackendClient

from .models import (
    WhamResetCredit,
    WhamResetCreditConsumeResponse,
    WhamResetCreditsResponse,
    WhamUsageWindow,
    WhamUsageResponse,
)

def _window(value: WhamUsageWindow) -> dict[str, int | float | None]:
    duration = value.limit_window_seconds

    return {
        "usedPercent": round(value.used_percent),
        "windowDurationMins": (duration + 59) // 60 if duration else None,
        "resetsAt": value.reset_at,
    }


def _credit(value: WhamResetCredit) -> dict[str, Any]:
    reset_type = {
        "codex_rate_limits": "codexRateLimits",
        "codexRateLimits": "codexRateLimits",
    }.get(value.reset_type, "unknown")

    return {
        "id": value.id,
        "resetType": reset_type,
        "status": value.status,
        "grantedAt": int(value.granted_at.timestamp()),
        "expiresAt": int(value.expires_at.timestamp()) if value.expires_at else None,
        "title": value.title,
        "description": value.description,
    }


def _usage(
    usage: WhamUsageResponse,
    reset_credits: WhamResetCreditsResponse,
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    rate_limit = usage.rate_limit
    if rate_limit:
        if rate_limit.primary_window:
            result["primary"] = _window(rate_limit.primary_window)
        if rate_limit.secondary_window:
            result["secondary"] = _window(rate_limit.secondary_window)
        if rate_limit.allowed is not None:
            result["ordinaryUsageAllowed"] = rate_limit.allowed
    if "primary" not in result and "secondary" not in result:
        raise ValueError("WHAM returned no usage windows")
    if usage.plan_type:
        result["planType"] = usage.plan_type
    result["rateLimitResetCredits"] = {
        "availableCount": reset_credits.available_count,
        "credits": [_credit(credit) for credit in reset_credits.credits],
    }

    return result


async def read_codex_usage(codex_home: str) -> dict[str, Any]:
    async with CodexBackendClient(codex_home) as client:
        usage, reset_credits = await asyncio.gather(
            client.get("usage"),
            client.get("rate-limit-reset-credits"),
        )
    return _usage(
        WhamUsageResponse.model_validate_json(usage),
        WhamResetCreditsResponse.model_validate_json(reset_credits),
    )


async def read_codex_plan(codex_home: str) -> str | None:
    async with CodexBackendClient(codex_home) as client:
        response = await client.get("usage")

    return WhamUsageResponse.model_validate_json(response).plan_type


async def consume_codex_usage_reset(
    codex_home: str,
    credit_id: str,
    idempotency_key: str,
) -> str:
    async with CodexBackendClient(codex_home) as client:
        response = await client.post(
            "rate-limit-reset-credits/consume",
            {
                "credit_id": credit_id,
                "redeem_request_id": idempotency_key,
            },
        )

    result = WhamResetCreditConsumeResponse.model_validate_json(response)

    return result.outcome
