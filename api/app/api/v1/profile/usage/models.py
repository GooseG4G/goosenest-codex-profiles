from datetime import datetime
from typing import Literal, Optional

from api.v1.models import Entity, Meta
from pydantic import BaseModel, Field


class UsageLimitsMeta(Meta):
    type: Literal["profile-usage-limits"] = Field(
        default="profile-usage-limits",
    )


class UsageResetsMeta(Meta):
    type: Literal["profile-usage-resets"] = Field(
        default="profile-usage-resets",
    )


class UsageResetMeta(Meta):
    type: Literal["profile-usage-reset"] = Field(
        default="profile-usage-reset",
    )


class UsageWindow(BaseModel):
    used_percent: float = Field(
        ...,
        ge=0,
        le=100,
    )

    window_duration_minutes: Optional[int] = Field(
        default=None,
        ge=1,
    )

    resets_at: Optional[int] = Field(
        default=None,
        ge=0,
    )


class UsageLimitsEntity(Entity[UsageLimitsMeta]):
    plan_type: Optional[str] = Field(
        default=None,
    )

    primary: Optional[UsageWindow] = Field(
        default=None,
    )

    secondary: Optional[UsageWindow] = Field(
        default=None,
    )

    updated_at: Optional[datetime] = Field(
        default=None,
    )

    stale: bool = Field(
        default=True,
    )

    refreshing: bool = Field(
        default=False,
    )


class UsageResetCredit(BaseModel):
    reset_id: str = Field(
        ...,
        min_length=1,
    )

    status: Literal["available", "redeeming", "redeemed", "unknown"] = Field(
        ...,
    )

    reset_type: Literal["codexRateLimits", "unknown"] = Field(
        ...,
    )

    title: Optional[str] = Field(
        default=None,
    )

    description: Optional[str] = Field(
        default=None,
    )

    granted_at: int = Field(
        ...,
        ge=0,
    )

    expires_at: Optional[int] = Field(
        default=None,
        ge=0,
    )


class UsageResetsEntity(Entity[UsageResetsMeta]):
    available_count: int = Field(
        default=0,
        ge=0,
    )

    credits: Optional[list[UsageResetCredit]] = Field(
        default=None,
    )

    updated_at: Optional[datetime] = Field(
        default=None,
    )

    stale: bool = Field(
        default=True,
    )

    refreshing: bool = Field(
        default=False,
    )


class UsageResetEntity(Entity[UsageResetMeta]):
    task_id: str = Field(
        ...,
        min_length=1,
    )

    idempotency_key: str = Field(
        ...,
        min_length=1,
    )

    status: Literal["queued"] = Field(
        default="queued",
    )
