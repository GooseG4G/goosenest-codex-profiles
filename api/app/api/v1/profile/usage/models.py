from datetime import datetime
from typing import Literal, Optional

from api.v1.models import Entity, Meta
from pydantic import BaseModel, Field


class UsageLimitsMeta(Meta):
    type: Literal["profile-usage-limits"] = Field(
        default="profile-usage-limits",
        description="Resource type",
    )


class UsageResetsMeta(Meta):
    type: Literal["profile-usage-resets"] = Field(
        default="profile-usage-resets",
        description="Resource type",
    )


class UsageResetMeta(Meta):
    type: Literal["profile-usage-reset"] = Field(
        default="profile-usage-reset",
        description="Resource type",
    )


class UsageWindow(BaseModel):
    used_percent: float = Field(
        ...,
        ge=0,
        le=100,
        description="Percentage of the usage window already consumed",
    )

    window_duration_minutes: Optional[int] = Field(
        default=None,
        ge=1,
        description="Usage window duration in minutes",
    )

    resets_at: Optional[int] = Field(
        default=None,
        ge=0,
        description="Unix timestamp when the usage window resets",
    )


class UsageLimitsEntity(Entity[UsageLimitsMeta]):
    plan_type: Optional[str] = Field(
        default=None,
        description="Codex subscription plan type",
    )

    primary: Optional[UsageWindow] = Field(
        default=None,
        description="Primary usage window",
    )

    secondary: Optional[UsageWindow] = Field(
        default=None,
        description="Secondary usage window",
    )

    updated_at: Optional[datetime] = Field(
        default=None,
        description="Time when usage was last refreshed",
    )

    stale: bool = Field(
        default=True,
        description="Whether the stored usage may be stale",
    )

    refreshing: bool = Field(
        default=False,
        description="Whether a usage refresh has been queued",
    )


class UsageResetCredit(BaseModel):
    reset_id: str = Field(
        ...,
        min_length=1,
        description="Reset credit identifier",
    )

    status: Literal["available", "redeeming", "redeemed", "unknown"] = Field(
        ...,
        description="Current reset credit status",
    )

    reset_type: Literal["codexRateLimits", "unknown"] = Field(
        ...,
        description="Type of rate limit reset",
    )

    title: Optional[str] = Field(
        default=None,
        description="User-facing reset credit title",
    )

    description: Optional[str] = Field(
        default=None,
        description="User-facing reset credit description",
    )

    granted_at: int = Field(
        ...,
        ge=0,
        description="Unix timestamp when the reset credit was granted",
    )

    expires_at: Optional[int] = Field(
        default=None,
        ge=0,
        description="Unix timestamp when the reset credit expires",
    )


class UsageResetsEntity(Entity[UsageResetsMeta]):
    available_count: int = Field(
        default=0,
        ge=0,
        description="Number of available reset credits",
    )

    credits: Optional[list[UsageResetCredit]] = Field(
        default=None,
        description="Available and historical reset credits",
    )

    updated_at: Optional[datetime] = Field(
        default=None,
        description="Time when reset credits were last refreshed",
    )

    stale: bool = Field(
        default=True,
        description="Whether the stored reset credits may be stale",
    )

    refreshing: bool = Field(
        default=False,
        description="Whether a usage refresh has been queued",
    )


class UsageResetEntity(Entity[UsageResetMeta]):
    task_id: str = Field(
        ...,
        min_length=1,
        description="Queued task identifier",
    )

    idempotency_key: str = Field(
        ...,
        min_length=1,
        description="Idempotency key used to consume the reset credit",
    )

    status: Literal["queued"] = Field(
        default="queued",
        description="Reset request status",
    )
