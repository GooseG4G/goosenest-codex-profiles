import pytest
from pydantic import ValidationError
from integrations.codex.usage.models import (
    WhamResetCreditsResponse,
    WhamUsageResponse,
)
from integrations.codex.usage.usage import _usage


def test_normalizes_typed_wham_usage_and_reset_credits() -> None:
    usage = WhamUsageResponse.model_validate(
        {
            "plan_type": "plus",
            "rate_limit": {
                "allowed": True,
                "primary_window": {
                    "used_percent": 12.4,
                    "limit_window_seconds": 18_000,
                    "reset_at": 1_800_000_000,
                },
                "secondary_window": {
                    "used_percent": 31,
                    "limit_window_seconds": 604_800,
                    "reset_at": 1_800_100_000,
                },
            },
        }
    )
    credits = WhamResetCreditsResponse.model_validate(
        {
            "available_count": 1,
            "credits": [
                {
                    "id": "full",
                    "reset_type": "codex_rate_limits",
                    "status": "available",
                    "granted_at": "2026-10-20T10:00:00Z",
                    "expires_at": "2026-10-21T10:00:00Z",
                }
            ],
        }
    )

    result = _usage(usage, credits)

    assert result["primary"]["usedPercent"] == 12
    assert result["primary"]["windowDurationMins"] == 300
    assert result["secondary"]["windowDurationMins"] == 10_080
    assert result["planType"] == "plus"
    assert result["ordinaryUsageAllowed"] is True
    assert result["rateLimitResetCredits"]["availableCount"] == 1
    assert (
        result["rateLimitResetCredits"]["credits"][0]["resetType"]
        == "codexRateLimits"
    )
    assert result["rateLimitResetCredits"]["credits"][0]["grantedAt"] == 1_792_490_400


def test_wham_models_reject_malformed_windows() -> None:
    with pytest.raises(ValidationError):
        WhamUsageResponse.model_validate(
            {"rate_limit": {"primary_window": {"used_percent": "invalid"}}}
        )
