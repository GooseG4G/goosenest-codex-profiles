import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import UUID


@dataclass
class DeviceFlow:
    uid: UUID
    profile_id: UUID
    codex_home: Path
    one_time_code: str
    verification_url: str
    process: asyncio.subprocess.Process
    created_at: float
    login_id: str
    target_profile_id: UUID | None = None
    error: str = ""
    completed: bool = False
    committed: bool = False
    reader_task: asyncio.Task[None] | None = None
    pending: dict[int, asyncio.Future[dict[str, Any]]] = field(default_factory=dict)
    request_id: int = 0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    completion_event: asyncio.Event = field(default_factory=asyncio.Event)
    result_status: str = "pending"
    result_profile_id: UUID | None = None
    result_detail: str = ""
