"""Resetting user activity. Never runs without an explicit confirmation from the CLI (app.devtools)."""

from dataclasses import dataclass

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models import (
    DiscoveryRun,
    LeadRecord,
    ManualReview,
    OSMBusiness,
    OutreachEvent,
    PossibleDuplicate,
    ReviewReachability,
    WebsiteIssue,
)
from app.models.enums import RecordState

# "activity": forget every review/decision/CRM record but keep the discovered OSM businesses.
# "all":      additionally remove discovered businesses and discovery runs (sectors/locations stay).
RESET_MODES = ("activity", "all")

_ACTIVITY_TABLES = (OutreachEvent, LeadRecord, WebsiteIssue, ReviewReachability, ManualReview, PossibleDuplicate)


@dataclass
class ResetPlan:
    mode: str
    counts: dict[str, int]  # rows that would be deleted, per table
    businesses_reset: int  # businesses whose decision state returns to DISCOVERED


def plan_reset(db: Session, mode: str) -> ResetPlan:
    if mode not in RESET_MODES:
        raise ValueError(f"Unknown reset mode {mode!r}; use one of {RESET_MODES}")
    tables = list(_ACTIVITY_TABLES) + ([OSMBusiness, DiscoveryRun] if mode == "all" else [])
    counts = {t.__tablename__: db.scalar(select(func.count()).select_from(t)) or 0 for t in tables}
    touched = db.scalar(
        select(func.count(OSMBusiness.id)).where(
            (OSMBusiness.record_state != RecordState.DISCOVERED) | OSMBusiness.favorite.is_(True)
        )
    ) or 0
    return ResetPlan(mode=mode, counts=counts, businesses_reset=0 if mode == "all" else touched)


def apply_reset(db: Session, mode: str) -> ResetPlan:
    """Apply in one transaction. The caller is responsible for taking a backup first."""
    plan = plan_reset(db, mode)
    for table in _ACTIVITY_TABLES:  # children before parents
        db.execute(delete(table))
    if mode == "all":
        db.execute(delete(OSMBusiness))
        db.execute(delete(DiscoveryRun))
    else:
        db.execute(
            update(OSMBusiness).values(
                record_state=RecordState.DISCOVERED, favorite=False, reject_reason=None, reject_note=None, decided_at=None
            )
        )
    db.commit()
    return plan
