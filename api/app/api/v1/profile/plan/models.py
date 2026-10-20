from datetime import datetime

from typing import Optional

from pydantic import BaseModel, Field


class ProfilePlan(BaseModel):
    plan_type: Optional[str] = Field(
        default=None,
        description="Codex subscription plan type",
    )

    updated_at: Optional[datetime] = Field(
        default=None,
        description="Time when the plan was last refreshed",
    )

    stale: bool = Field(
        default=True,
        description="Whether the stored plan may be stale",
    )

    refreshing: bool = Field(
        default=False,
        description="Whether a plan refresh has been queued",
    )
