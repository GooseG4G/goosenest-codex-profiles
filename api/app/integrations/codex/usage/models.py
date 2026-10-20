from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class WhamResponse(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        extra="ignore",
    )


class WhamUsageWindow(WhamResponse):
    used_percent: float = Field(
        ...,
        ge=0,
        le=100,
        description="Percentage of the usage window already consumed",
    )

    limit_window_seconds: Optional[int] = Field(
        default=None,
        ge=1,
        description="Usage window duration in seconds",
    )

    reset_at: Optional[int] = Field(
        default=None,
        ge=0,
        description="Unix timestamp when the usage window resets",
    )


class WhamRateLimit(WhamResponse):
    allowed: Optional[bool] = Field(
        default=None,
        description="Whether ordinary included usage is currently allowed",
    )

    primary_window: Optional[WhamUsageWindow] = Field(
        default=None,
        description="Primary rate-limit window",
    )

    secondary_window: Optional[WhamUsageWindow] = Field(
        default=None,
        description="Secondary rate-limit window",
    )


class WhamResetCreditsSummary(WhamResponse):
    available_count: int = Field(
        default=0,
        ge=0,
        description="Number of available usage reset credits",
    )


class WhamUsageResponse(WhamResponse):
    plan_type: Optional[str] = Field(
        default=None,
        description="ChatGPT subscription plan type",
    )

    rate_limit: Optional[WhamRateLimit] = Field(
        default=None,
        description="Current Codex rate-limit state",
    )

    rate_limit_reset_credits: Optional[WhamResetCreditsSummary] = Field(
        default=None,
        description="Summary of available rate-limit reset credits",
    )


class WhamResetCredit(WhamResponse):
    id: str = Field(
        ...,
        min_length=1,
        description="Reset credit identifier",
    )

    reset_type: str = Field(
        default="unknown",
        min_length=1,
        description="Type of rate limit reset performed by the credit",
    )

    status: str = Field(
        default="unknown",
        min_length=1,
        description="Current reset credit status",
    )

    granted_at: datetime = Field(
        ...,
        description="Time when the reset credit was granted",
    )

    expires_at: Optional[datetime] = Field(
        default=None,
        description="Time when the reset credit expires",
    )

    title: Optional[str] = Field(
        default=None,
        description="User-facing reset credit title",
    )

    description: Optional[str] = Field(
        default=None,
        description="User-facing reset credit description",
    )


class WhamResetCreditsResponse(WhamResponse):
    available_count: int = Field(
        default=0,
        ge=0,
        description="Number of available usage reset credits",
    )

    credits: list[WhamResetCredit] = Field(
        default_factory=list,
        description="Rate-limit reset credits associated with the account",
    )


class WhamResetCreditConsumeResponse(WhamResponse):
    outcome: Literal[
        "reset",
        "nothingToReset",
        "noCredit",
        "alreadyRedeemed",
    ] = Field(
        ...,
        description="Outcome of consuming a rate-limit reset credit",
    )
