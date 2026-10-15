import pytest
from integrations.codex.usage import (
    CodexAuthenticationError,
    CodexUsageError,
    _normalize_result,
    codex_error,
)


def test_normalizes_codex_rate_limit_windows_and_reset_credits() -> None:
    usage = _normalize_result(
        {
            "rateLimitsByLimitId": {
                "codex": {
                    "planType": "plus",
                    "primary": {
                        "usedPercent": 12.4,
                        "windowDurationMins": 300,
                        "resetsAt": 1_800_000_000,
                    },
                    "secondary": {
                        "usedPercent": 31,
                        "windowDurationMins": 10_080,
                        "resetsAt": 1_800_100_000,
                    },
                },
            },
            "ordinaryUsageAllowed": True,
            "rateLimitResetCredits": {
                "availableCount": 1,
                "credits": [{"id": "full", "status": "available"}],
            },
        }
    )

    assert usage["primary"]["usedPercent"] == 12
    assert usage["secondary"]["windowDurationMins"] == 10_080
    assert usage["ordinaryUsageAllowed"] is True
    assert usage["rateLimitResetCredits"]["availableCount"] == 1


def test_rejects_response_without_usage_windows() -> None:
    with pytest.raises(CodexUsageError, match="no usage windows"):
        _normalize_result({"rateLimits": {}})


@pytest.mark.parametrize(
    "message",
    [
        "401 Unauthorized",
        "token_revoked",
        "Encountered invalidated oauth token for user",
        "Codex profile is not authenticated",
    ],
)
def test_classifies_authentication_failures(message: str) -> None:
    assert isinstance(codex_error(message), CodexAuthenticationError)


def test_preserves_non_authentication_usage_errors() -> None:
    assert type(codex_error("Codex returned no usage windows")) is CodexUsageError
