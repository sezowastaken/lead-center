from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.models import OSMBusiness, Sector
from app.models.enums import REVIEW_QUEUE_STATES, RecordState

# "queue" = normal review queue, "active" = everything except rejected, "decided" = has a decision.
STATE_VIEWS = {
    "queue": list(REVIEW_QUEUE_STATES),
    "active": [s for s in RecordState if s != RecordState.REJECTED],
    "decided": [RecordState.REJECTED, RecordState.FAVORITED, RecordState.APPROVED],
}

# sector_id / location_id value meaning "not assigned" (NULL), e.g. from Coverage's "Unassigned" rows.
NONE = "none"


@dataclass
class BusinessFilters:
    state: str | None = "queue"  # queue | active | all | <RecordState>
    sector_id: int | str | None = None  # an id, or NONE for unassigned
    location_id: int | str | None = None
    website_type: str | None = None
    has_phone: bool | None = None
    has_website: bool | None = None
    favorite: bool | None = None
    discovered_since: date | None = None
    commercial_priority: str | None = None
    osm_coverage: str | None = None
    q: str | None = None


def apply_filters(stmt: Select, f: BusinessFilters) -> Select:
    if f.state and f.state != "all":
        states = STATE_VIEWS.get(f.state) or [RecordState(f.state)]
        stmt = stmt.where(OSMBusiness.record_state.in_(states))
    if f.sector_id is not None:
        stmt = stmt.where(OSMBusiness.sector_id.is_(None) if f.sector_id == NONE else OSMBusiness.sector_id == f.sector_id)
    if f.location_id is not None:
        stmt = stmt.where(OSMBusiness.location_id.is_(None) if f.location_id == NONE else OSMBusiness.location_id == f.location_id)
    if f.website_type:
        stmt = stmt.where(OSMBusiness.normalized_website_type == f.website_type)
    if f.has_phone is not None:
        stmt = stmt.where(OSMBusiness.phone.is_not(None) if f.has_phone else OSMBusiness.phone.is_(None))
    if f.has_website is not None:
        stmt = stmt.where(OSMBusiness.website.is_not(None) if f.has_website else OSMBusiness.website.is_(None))
    if f.favorite is not None:
        stmt = stmt.where(OSMBusiness.favorite.is_(f.favorite))
    if f.discovered_since is not None:
        stmt = stmt.where(OSMBusiness.first_seen_at >= datetime.combine(f.discovered_since, datetime.min.time()))
    if f.commercial_priority or f.osm_coverage:
        stmt = stmt.join(Sector, OSMBusiness.sector_id == Sector.id)
        if f.commercial_priority:
            stmt = stmt.where(Sector.commercial_priority == f.commercial_priority)
        if f.osm_coverage:
            stmt = stmt.where(Sector.osm_coverage == f.osm_coverage)
    if f.q:
        like = f"%{f.q.strip()}%"
        stmt = stmt.where(or_(OSMBusiness.name.ilike(like), OSMBusiness.address_text.ilike(like)))
    return stmt


SORTS = {
    "newest": (OSMBusiness.first_seen_at.desc(), OSMBusiness.id.desc()),
    "oldest": (OSMBusiness.first_seen_at.asc(), OSMBusiness.id.asc()),
    "name": (OSMBusiness.name.is_(None), OSMBusiness.name.asc(), OSMBusiness.id.asc()),
}


def list_businesses(
    db: Session, f: BusinessFilters, *, sort: str = "newest", limit: int = 60, offset: int = 0
) -> tuple[list[OSMBusiness], int]:
    total = db.scalar(apply_filters(select(func.count(OSMBusiness.id)), f)) or 0
    stmt = apply_filters(select(OSMBusiness), f).order_by(*SORTS.get(sort, SORTS["newest"])).limit(limit).offset(offset)
    return list(db.scalars(stmt).unique()), total


def next_in_queue(db: Session, f: BusinessFilters, after_id: int | None) -> tuple[OSMBusiness | None, int]:
    """Next business in the normal review queue (oldest first by id), wrapping around after `after_id`."""
    f.state = "queue"
    remaining = db.scalar(apply_filters(select(func.count(OSMBusiness.id)), f)) or 0
    base = apply_filters(select(OSMBusiness), f).order_by(OSMBusiness.id.asc()).limit(1)
    business = None
    if after_id is not None:
        business = db.scalars(base.where(OSMBusiness.id > after_id)).unique().first()
    if business is None:
        business = db.scalars(base).unique().first()
    return business, remaining
