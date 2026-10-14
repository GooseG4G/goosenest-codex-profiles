from datetime import datetime
from typing import Literal

from api.v1.models import Entity, Meta
from pydantic import BaseModel


class UsageMeta(Meta):
    type: Literal["profile-usage"] = "profile-usage"


class UsageWindow(BaseModel):
    used_percent: float
    window_duration_minutes: int | None = None
    resets_at: int | None = None


class UsageLimitsEntity(Entity[UsageMeta]):
    primary: UsageWindow | None = None
    secondary: UsageWindow | None = None
    updated_at: datetime | None = None
    stale: bool = True
    refreshing: bool = False


class UsageResetCredit(BaseModel):
    reset_id: str
    status: Literal["available", "redeeming", "redeemed", "unknown"]
    reset_type: Literal["codexRateLimits", "unknown"]
    title: str | None = None
    description: str | None = None
    granted_at: int
    expires_at: int | None = None


class UsageResetsEntity(Entity[UsageMeta]):
    available_count: int = 0
    credits: list[UsageResetCredit] | None = None
    updated_at: datetime | None = None
    stale: bool = True
    refreshing: bool = False


class UsageResetEntity(Entity[UsageMeta]):
    task_id: str
    idempotency_key: str
    status: Literal["queued"] = "queued"
