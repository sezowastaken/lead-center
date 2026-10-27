"""Polite public-Overpass client (spec §15): local cache, identifying User-Agent, one request at a time,
bounded retries, pause on 429/504. Public Overpass is for P0/prototyping only."""

import hashlib
import json
import logging
import threading
import time
from collections.abc import Callable
from pathlib import Path

import httpx

from app.config import Settings
from app.services.osm.base import DiscoveryError

log = logging.getLogger(__name__)

# One Overpass request at a time across the whole app — no parallel query spam.
_request_lock = threading.Lock()

RETRYABLE_STATUS = {429, 502, 503, 504}
MAX_BACKOFF_SECONDS = 60


class OverpassClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.settings = settings
        self.cache_dir: Path = settings.cache_dir
        self._transport = transport
        self._sleep = sleep

    def _cache_path(self, query: str) -> Path:
        digest = hashlib.sha256(f"{self.settings.overpass_url}\n{query}".encode()).hexdigest()
        return self.cache_dir / f"{digest}.json"

    def _read_cache(self, query: str) -> dict | None:
        path = self._cache_path(query)
        if not path.exists():
            return None
        age_hours = (time.time() - path.stat().st_mtime) / 3600
        if age_hours > self.settings.overpass_cache_ttl_hours:
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def _write_cache(self, query: str, payload: dict) -> None:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._cache_path(query).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    def run(self, query: str, *, force_refresh: bool = False) -> tuple[dict, bool]:
        """Execute a query. Returns (payload, from_cache)."""
        if not force_refresh:
            cached = self._read_cache(query)
            if cached is not None:
                log.info("Overpass cache hit")
                return cached, True

        with _request_lock:
            payload = self._fetch(query)
        self._write_cache(query, payload)
        return payload, False

    def _fetch(self, query: str) -> dict:
        headers = {"User-Agent": self.settings.user_agent, "Accept": "application/json"}
        timeout = httpx.Timeout(self.settings.overpass_timeout_seconds + 30, connect=15)
        attempts = self.settings.overpass_max_retries + 1
        last_error = "unknown error"

        with httpx.Client(headers=headers, timeout=timeout, transport=self._transport) as http:
            for attempt in range(1, attempts + 1):
                try:
                    resp = http.post(self.settings.overpass_url, data={"data": query})
                except httpx.HTTPError as exc:
                    last_error = f"network error: {exc}"
                    log.warning("Overpass attempt %d/%d failed: %s", attempt, attempts, last_error)
                    if attempt < attempts:
                        self._sleep(min(10 * attempt, MAX_BACKOFF_SECONDS))
                    continue

                if resp.status_code == 200:
                    payload = resp.json()
                    remark = payload.get("remark") or ""
                    if "runtime error" in remark.lower():
                        # Overpass reports query timeouts/memory errors inside a 200 response.
                        raise DiscoveryError(f"Overpass runtime error: {remark}")
                    return payload

                if resp.status_code == 406:
                    raise DiscoveryError("Overpass rejected the request (406). Check User-Agent / query format.")
                if resp.status_code == 400:
                    raise DiscoveryError(f"Overpass rejected the query (400): {resp.text[:500]}")

                last_error = f"HTTP {resp.status_code}"
                if resp.status_code in RETRYABLE_STATUS and attempt < attempts:
                    wait = self._retry_after(resp) or min(15 * attempt, MAX_BACKOFF_SECONDS)
                    log.warning("Overpass busy (%s); pausing %ss before retry %d", last_error, wait, attempt + 1)
                    self._sleep(wait)
                    continue
                if resp.status_code not in RETRYABLE_STATUS:
                    break

        raise DiscoveryError(f"Overpass request failed after {attempts} attempt(s): {last_error}")

    @staticmethod
    def _retry_after(resp: httpx.Response) -> float | None:
        value = resp.headers.get("Retry-After")
        if value and value.isdigit():
            return min(float(value), MAX_BACKOFF_SECONDS)
        return None
