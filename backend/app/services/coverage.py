"""Coverage: how the business registry is distributed over sectors and locations.

All counts are SQL aggregations (COUNT / GROUP BY); the API only adds names and percentages.
"""

from sqlalchemy import case, func, select, true
from sqlalchemy.orm import Session

from app.models import Location, OSMBusiness, Sector
from app.models.enums import RecordState
from app.repositories.businesses import STATE_VIEWS

# population -> record states (None = all), and the matching Browse "state" filter
POPULATIONS: dict[str, list[str] | None] = {
    "waiting": STATE_VIEWS["queue"],
    "all": None,
    "decided": STATE_VIEWS["decided"],
    "approved": [RecordState.APPROVED],
    "rejected": [RecordState.REJECTED],
}
BROWSE_STATE = {"waiting": "queue", "all": "all", "decided": "decided", "approved": "APPROVED", "rejected": "REJECTED"}


def _pct(n: int, total: int) -> float:
    return round(100 * n / total, 1) if total else 0.0


def build_coverage(db: Session, population: str) -> dict:
    states = POPULATIONS[population]
    in_population = OSMBusiness.record_state.in_(states) if states else true()

    state = OSMBusiness.record_state
    t = db.execute(
        select(
            func.count(OSMBusiness.id),
            func.count(case((state.in_(STATE_VIEWS["queue"]), 1))),
            func.count(case((state.in_(STATE_VIEWS["decided"]), 1))),
            func.count(case((state == RecordState.APPROVED, 1))),
            func.count(case((state == RecordState.REJECTED, 1))),
        )
    ).one()
    totals = {"total": t[0], "waiting": t[1], "decided": t[2], "approved": t[3], "rejected": t[4]}

    by_sector = dict(db.execute(select(OSMBusiness.sector_id, func.count(OSMBusiness.id)).where(in_population).group_by(OSMBusiness.sector_id)).all())
    by_location = dict(db.execute(select(OSMBusiness.location_id, func.count(OSMBusiness.id)).where(in_population).group_by(OSMBusiness.location_id)).all())
    cells = db.execute(
        select(OSMBusiness.sector_id, OSMBusiness.location_id, func.count(OSMBusiness.id))
        .where(in_population)
        .group_by(OSMBusiness.sector_id, OSMBusiness.location_id)
    ).all()
    population_total = db.scalar(select(func.count(OSMBusiness.id)).where(in_population)) or 0

    sectors = []
    for s in db.scalars(select(Sector).order_by(Sector.id)):
        n = by_sector.get(s.id, 0)
        if n or (s.enabled and s.osm_discovery_enabled):  # searchable sectors stay visible at 0 (coverage gaps)
            sectors.append(
                {"id": s.id, "name": s.name, "count": n, "pct": _pct(n, population_total), "review_weight": s.review_weight, "commercial_priority": s.commercial_priority}
            )
    if by_sector.get(None):
        n = by_sector[None]
        sectors.append({"id": None, "name": "Unassigned", "count": n, "pct": _pct(n, population_total), "review_weight": None, "commercial_priority": None})

    locations = []
    for loc in db.scalars(select(Location).order_by(Location.id)):
        n = by_location.get(loc.id, 0)
        if n or loc.enabled:
            # City-level rows (type CITY) are businesses inside the city but outside every configured
            # district; the UI labels them "<city> (no district)" in the user's language.
            locations.append({"id": loc.id, "name": loc.name, "type": loc.location_type, "count": n, "pct": _pct(n, population_total)})
    if by_location.get(None):
        n = by_location[None]
        locations.append({"id": None, "name": "Unassigned", "type": None, "count": n, "pct": _pct(n, population_total)})

    sectors.sort(key=lambda r: (-r["count"], r["name"]))
    locations.sort(key=lambda r: (-r["count"], r["name"]))
    return {
        "population": population,
        "browse_state": BROWSE_STATE[population],
        "totals": totals,
        "population_total": population_total,
        "sectors": sectors,
        "locations": locations,
        "cells": [{"sector_id": s, "location_id": l, "count": n} for s, l, n in cells],
    }
