import asyncio
import base64
import json
import os
import time
from pathlib import Path
from typing import Any

import httpx

CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
REFRESH_URL = "https://auth.openai.com/oauth/token"
_locks: dict[Path, asyncio.Lock] = {}


def _decode_exp(token: str) -> int:
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return int(json.loads(base64.urlsafe_b64decode(payload)).get("exp", 0))
    except (ValueError, TypeError, IndexError, json.JSONDecodeError):
        return 0


def read_auth(home: str) -> tuple[Path, dict[str, Any]]:
    path = Path(home) / "auth.json"
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Invalid auth.json")
    return path, value


def credentials(auth: dict[str, Any]) -> tuple[str | None, str | None]:
    tokens = auth.get("tokens") if isinstance(auth.get("tokens"), dict) else {}
    return (
        tokens.get("access_token")
        or auth.get("access_token")
        or auth.get("OPENAI_API_KEY"),
        tokens.get("account_id") or auth.get("account_id"),
    )


async def ensure_fresh(home: str, *, force: bool = False) -> tuple[str, str | None]:
    path, auth = read_auth(home)
    token, account_id = credentials(auth)
    if (
        token
        and not force
        and (_decode_exp(token) == 0 or _decode_exp(token) > time.time() + 120)
    ):
        return token, account_id

    lock = _locks.setdefault(path, asyncio.Lock())
    async with lock:
        _, auth = read_auth(home)
        token, account_id = credentials(auth)
        if (
            token
            and not force
            and (_decode_exp(token) == 0 or _decode_exp(token) > time.time() + 120)
        ):
            return token, account_id
        tokens = auth.get("tokens") if isinstance(auth.get("tokens"), dict) else {}
        refresh_token = tokens.get("refresh_token")
        if not isinstance(refresh_token, str) or not refresh_token:
            raise ValueError("Codex profile has no refresh token")
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                REFRESH_URL,
                json={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": CLIENT_ID,
                },
            )
            response.raise_for_status()
            refreshed = response.json()
        for key in ("access_token", "refresh_token", "id_token"):
            if refreshed.get(key):
                tokens[key] = refreshed[key]
        auth["tokens"] = tokens
        auth["last_refresh"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(auth, separators=(",", ":")), encoding="utf-8")
        os.replace(temporary, path)
        token, account_id = credentials(auth)
        if not token:
            raise ValueError("Token refresh returned no access token")
        return token, account_id


def usage_from_headers(headers: httpx.Headers) -> dict[str, Any] | None:
    result: dict[str, Any] = {}
    for window in ("primary", "secondary"):
        used = headers.get(f"x-codex-{window}-used-percent")
        if used is None:
            continue
        result[window] = {
            "usedPercent": float(used),
            "windowDurationMins": int(
                headers.get(f"x-codex-{window}-window-minutes", "0")
            ),
            "resetsAt": int(headers.get(f"x-codex-{window}-reset-at", "0")),
        }
    return result or None
