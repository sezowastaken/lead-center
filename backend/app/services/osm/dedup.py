"""OSM identity deduplication (spec §7.1). `osm_type + osm_id` is the durable key."""

import json
from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OSMBusiness
from app.models.enums import RecordState
from app.services.osm.base import RawOSMElement
from app.services.osm.normalizer import NormalizedBusiness


def dedupe_elements(elements: Iterable[RawOSMElement]) -> list[RawOSMElement]:
    """Collapse repeats within one run (an object can match several rule clauses)."""
    seen: dict[tuple[str, int], RawOSMElement] = {}
    for el in elements:
        seen.setdefault(el.key, el)
    return list(seen.values())


def _apply_osm_fields(business: OSMBusiness, nb: NormalizedBusiness) -> None:
    business.name = nb.name
    business.name_source = nb.name_source
    business.lat = nb.lat
    business.lon = nb.lon
    business.phone = nb.phone
    business.phone_raw = nb.phone_raw
    business.website = nb.website
    business.email = nb.email
    business.opening_hours = nb.opening_hours
    business.address_text = nb.address_text
    business.normalized_website_type = nb.website_type
    business.raw_tags_json = json.dumps(nb.tags, ensure_ascii=False, sort_keys=True)


def upsert_business(
    db: Session, nb: NormalizedBusiness, *, sector_id: int | None, location_id: int | None, now: datetime
) -> tuple[OSMBusiness, bool]:
    """Insert a new business or refresh a known one. Returns (business, is_new).

    For a known business only OSM-derived fields and sighting counters change. The user's
    decisions (record_state, favorite, reject reason), the original sector/location and the
    manual review are never touched — a rejected business stays rejected.
    """
    business = db.scalar(
        select(OSMBusiness).where(OSMBusiness.osm_type == nb.osm_type, OSMBusiness.osm_id == nb.osm_id)
    )
    if business is not None:
        _apply_osm_fields(business, nb)
        business.last_seen_at = now
        business.times_seen += 1
        if business.sector_id is None:
            business.sector_id = sector_id
        if business.location_id is None:
            business.location_id = location_id
        return business, False

    business = OSMBusiness(
        osm_type=nb.osm_type,
        osm_id=nb.osm_id,
        sector_id=sector_id,
        location_id=location_id,
        first_seen_at=now,
        last_seen_at=now,
        times_seen=1,
        record_state=RecordState.DISCOVERED,
        favorite=False,
    )
    _apply_osm_fields(business, nb)
    db.add(business)
    return business, True
