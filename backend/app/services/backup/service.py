"""Local SQLite backups (spec §39): one automatic backup per Istanbul day, 30 kept. Manual backups are never pruned."""

import logging
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.config import get_settings
from app.timeutil import LOCAL_TZ, local_now

log = logging.getLogger(__name__)

AUTO_RETENTION = 30
_NAME = re.compile(r"^lead_center_(\d{4}-\d{2}-\d{2})_(\d{6})(_manual)?\.db$")


@dataclass
class BackupInfo:
    name: str
    path: Path
    created_at: datetime  # Istanbul local time from the filename
    size_bytes: int
    manual: bool


def backup_dir() -> Path:
    return get_settings().database_file.parent / "backups"


def list_backups(directory: Path | None = None) -> list[BackupInfo]:
    directory = directory or backup_dir()
    if not directory.exists():
        return []
    items = []
    for path in directory.iterdir():
        m = _NAME.match(path.name)
        if not m:
            continue
        created = datetime.strptime(f"{m[1]}_{m[2]}", "%Y-%m-%d_%H%M%S").replace(tzinfo=LOCAL_TZ)
        items.append(BackupInfo(path.name, path, created, path.stat().st_size, bool(m[3])))
    return sorted(items, key=lambda b: b.name, reverse=True)


def create_backup(*, manual: bool = False, db_file: Path | None = None, directory: Path | None = None) -> BackupInfo:
    """Consistent copy via SQLite's online backup API (safe while the app is running, WAL included)."""
    db_file = db_file or get_settings().database_file
    directory = directory or backup_dir()
    directory.mkdir(parents=True, exist_ok=True)
    stamp = local_now().strftime("%Y-%m-%d_%H%M%S")
    final = directory / f"lead_center_{stamp}{'_manual' if manual else ''}.db"
    tmp = final.with_suffix(".db.tmp")

    src = sqlite3.connect(db_file)
    dst = sqlite3.connect(tmp)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    tmp.replace(final)
    log.info("Backup written: %s", final.name)
    if not manual:
        prune(directory)
    return next(b for b in list_backups(directory) if b.name == final.name)


def prune(directory: Path | None = None, keep: int = AUTO_RETENTION) -> list[str]:
    autos = [b for b in list_backups(directory) if not b.manual]
    removed = []
    for old in autos[keep:]:
        old.path.unlink(missing_ok=True)
        removed.append(old.name)
    return removed


def ensure_daily_backup(*, db_file: Path | None = None, directory: Path | None = None) -> BackupInfo | None:
    """Create today's automatic backup if it does not exist yet. No-op when there is no database."""
    db_file = db_file or get_settings().database_file
    if not db_file.exists() or db_file.stat().st_size == 0:
        return None
    today = local_now().date()
    if any(not b.manual and b.created_at.date() == today for b in list_backups(directory)):
        return None
    return create_backup(db_file=db_file, directory=directory)
