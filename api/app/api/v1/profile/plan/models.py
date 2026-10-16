from datetime import datetime

from pydantic import BaseModel


class ProfilePlan(BaseModel):
    plan_type: str | None = None
    updated_at: datetime | None = None
    stale: bool = True
    refreshing: bool = False
