"""One long-running OSM data job at a time (download / update / import), with progress and cancel.

Jobs run in a background thread and only ever start from an explicit user action. The outcome of each
job type is persisted in app_settings so the Settings page can show it after a restart.
"""

import logging
import threading
import traceback
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from typing import Any

from app.database import SessionLocal, utcnow
from app.services.app_settings import set_json
from app.services.osm.pbf.files import Cancelled

log = logging.getLogger(__name__)


@dataclass
class Job:
    kind: str  # download | update | import
    status: str = "running"  # running | succeeded | failed | cancelled | unavailable
    phase: str = "Starting"
    done: int = 0
    total: int | None = None
    message: str | None = None
    result: dict[str, Any] = field(default_factory=dict)
    started_at: str = field(default_factory=lambda: utcnow().isoformat())
    finished_at: str | None = None

    def report(self, phase: str, done: int = 0, total: int | None = None) -> None:
        self.phase, self.done, self.total = phase, done, total


class JobBusy(Exception):
    pass


class JobManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._job: Job | None = None
        self._cancel = threading.Event()
        self._thread: threading.Thread | None = None

    @property
    def current(self) -> Job | None:
        return self._job

    @property
    def running(self) -> bool:
        return self._job is not None and self._job.status == "running"

    def start(self, kind: str, work: Callable[[Job, threading.Event], dict | None]) -> Job:
        with self._lock:
            if self.running:
                raise JobBusy(f"A {self._job.kind} is already running")
            self._cancel = threading.Event()
            job = Job(kind=kind)
            self._job = job
            self._thread = threading.Thread(target=self._run, args=(job, work, self._cancel), name=f"osm-{kind}", daemon=True)
            self._thread.start()
            return job

    def cancel(self) -> bool:
        if not self.running:
            return False
        self._cancel.set()
        return True

    def wait(self, timeout: float | None = None) -> None:
        if self._thread is not None:
            self._thread.join(timeout)

    def _run(self, job: Job, work: Callable[[Job, threading.Event], dict | None], cancel: threading.Event) -> None:
        try:
            result = work(job, cancel) or {}
            job.result = result
            job.status = result.pop("_status", "succeeded")
            job.message = result.pop("_message", job.message)
        except Cancelled as exc:
            job.status, job.message = "cancelled", str(exc)
        except Exception as exc:  # noqa: BLE001 — surfaced to the user, previous data stays in place
            log.error("OSM %s failed: %s\n%s", job.kind, exc, traceback.format_exc())
            job.status, job.message = "failed", str(exc) or type(exc).__name__
        finally:
            job.finished_at = utcnow().isoformat()
            job.phase = {"succeeded": "Done", "cancelled": "Cancelled", "unavailable": "Not available"}.get(job.status, "Failed")
            try:
                with SessionLocal() as db:
                    set_json(db, f"osm.last_{job.kind}", asdict(job))
            except Exception:  # noqa: BLE001
                log.exception("Could not persist OSM job result")


jobs = JobManager()
