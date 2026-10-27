"""Discovery orchestrator: provider -> sector mapper -> normalizer -> dedup -> registry (spec §6).

Source-agnostic: it only talks to the `OSMSource` interface.
"""

import logging

from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import utcnow
from app.models import DiscoveryRun, Location, Sector
from app.services.osm.base import DiscoveryError, OSMSource
from app.services.osm.dedup import dedupe_elements, upsert_business
from app.services.osm.normalizer import normalize
from app.services.osm.overpass.client import OverpassClient
from app.services.osm.overpass.provider import OverpassProvider
from app.services.osm.sector_mapper import matching_rule

log = logging.getLogger(__name__)


def default_provider() -> OSMSource:
    return OverpassProvider(OverpassClient(get_settings()))


def run_discovery(
    db: Session, provider: OSMSource, sector: Sector, location: Location, *, force_refresh: bool = False
) -> DiscoveryRun:
    run = DiscoveryRun(provider=provider.name, sector_id=sector.id, location_id=location.id, started_at=utcnow())
    db.add(run)
    db.commit()  # the run is logged even if discovery fails

    query_or_source: str | None = None
    try:
        if not sector.osm_discovery_enabled:
            raise DiscoveryError(f"OSM discovery is disabled for sector '{sector.name}'")
        result = provider.discover(sector, location, force_refresh=force_refresh)
        query_or_source = result.query_or_source
        run.query_or_source = query_or_source
        run.from_cache = result.from_cache

        elements = dedupe_elements(result.elements)
        now = utcnow()
        new_count = known_count = 0
        for element in elements:
            if matching_rule(sector, element.tags) is None:
                # Returned by the source for this sector but no local rule matched (e.g. regex
                # dialect differences). Keep it — the user decides, not the mapper.
                log.debug("No local rule matched %s/%s", element.osm_type, element.osm_id)
            _, is_new = upsert_business(
                db, normalize(element), sector_id=sector.id, location_id=location.id, now=now
            )
            if is_new:
                new_count += 1
            else:
                known_count += 1
            db.flush()

        run.result_count = len(elements)
        run.new_count = new_count
        run.known_count = known_count
        run.completed_at = utcnow()
        db.commit()
        log.info(
            "Discovery %s / %s: %d results (%d new, %d known, cache=%s)",
            sector.name, location.name, run.result_count, new_count, known_count, run.from_cache,
        )
    except Exception as exc:  # noqa: BLE001 — every failure is recorded on the run
        db.rollback()
        run = db.get(DiscoveryRun, run.id)
        run.query_or_source = query_or_source
        run.error = str(exc) if isinstance(exc, DiscoveryError) else f"{type(exc).__name__}: {exc}"
        run.completed_at = utcnow()
        db.commit()
        log.warning("Discovery failed: %s", run.error)
    return run
