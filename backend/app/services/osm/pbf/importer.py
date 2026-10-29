"""Import businesses from the local OSM extract (spec §16–17), using pyosmium.

Two passes keep memory small even for the full Turkey file:
  1. A C++ key filter streams only objects carrying business-like tags (plus the boundary relations of
     the configured locations). Python applies the sector rules and a BackReferenceWriter copies the
     matches — together with the nodes/ways they reference — into a small temporary file.
  2. That small file is read with node locations and area assembly to compute business coordinates
     and the district polygons. Each business is assigned to the configured district containing it
     (else the city); anything outside the city is skipped.

Results go through the same normalizer and OSM-identity upsert as Overpass, so user decisions,
reviews, leads and CRM history are never touched.
"""

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import utcnow
from app.models import DiscoveryRun, Location, Sector
from app.models.enums import LocationType
from app.services.osm.base import DiscoveryError, DiscoveryResult, OSMSource, RawOSMElement
from app.services.osm.dedup import upsert_business
from app.services.osm.normalizer import normalize
from app.services.osm.pbf.files import Cancelled, read_pbf_info
from app.services.osm.sector_mapper import POI_KEYS, match_order, matching_rule

log = logging.getLogger(__name__)

TYPE_NAMES = {"n": "node", "w": "way", "r": "relation"}
ProgressFn = Callable[[str, int, int | None], None]

Ring = list[tuple[float, float]]  # (lon, lat)


@dataclass
class Polygon:
    outers: list[Ring] = field(default_factory=list)
    inners: list[Ring] = field(default_factory=list)
    bbox: tuple[float, float, float, float] = (180.0, 90.0, -180.0, -90.0)

    def add_outer(self, ring: Ring) -> None:
        self.outers.append(ring)
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        minx, miny, maxx, maxy = self.bbox
        self.bbox = (min(minx, *xs), min(miny, *ys), max(maxx, *xs), max(maxy, *ys))

    def contains(self, lon: float, lat: float) -> bool:
        minx, miny, maxx, maxy = self.bbox
        if not (minx <= lon <= maxx and miny <= lat <= maxy):
            return False
        return any(_in_ring(lon, lat, r) for r in self.outers) and not any(_in_ring(lon, lat, r) for r in self.inners)


def _in_ring(x: float, y: float, ring: Ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _centroid(points: Ring) -> tuple[float, float] | None:
    if not points:
        return None
    return sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)


def _first_sector(sectors: list[Sector], tags: dict[str, str]) -> Sector | None:
    """`sectors` must already be in match_order (e.g. Burger before Fast Food / Restaurants)."""
    for sector in sectors:
        if matching_rule(sector, tags) is not None:
            return sector
    return None


@dataclass
class ScanHit:
    element: RawOSMElement
    sector_id: int
    location_id: int


@dataclass
class ScanStats:
    candidates: int = 0  # objects passing the key filter
    matched: int = 0  # matched a sector rule
    no_location: int = 0  # coordinates could not be computed
    outside: int = 0  # outside the configured city


def scan_pbf(
    pbf: Path,
    sectors: list[Sector],
    locations: list[Location],
    *,
    work_dir: Path,
    cancel: threading.Event | None = None,
    progress: ProgressFn | None = None,
) -> tuple[list[ScanHit], ScanStats]:
    import osmium

    cancel = cancel or threading.Event()
    progress = progress or (lambda *_: None)
    stats = ScanStats()
    sectors = match_order(sectors)
    city = next((l for l in locations if l.location_type == LocationType.CITY and l.osm_relation_id), None)
    if city is None:
        raise DiscoveryError("No city location with an OSM boundary is configured (locations.json)")
    wanted_rel = {l.osm_relation_id: l for l in locations if l.osm_relation_id}
    keys = set(POI_KEYS) | {r.tag_key for s in sectors for r in s.rules if r.tag_key} | {"boundary"}

    # ---- Pass 1: filter the big file down to candidate businesses + boundaries ----
    work_dir.mkdir(parents=True, exist_ok=True)
    small = work_dir / "_import_filtered.osm.pbf"
    matched: dict[tuple[str, int], int] = {}
    writer = osmium.BackReferenceWriter(str(small), ref_src=str(pbf), overwrite=True)
    try:
        for i, obj in enumerate(osmium.FileProcessor(str(pbf)).with_filter(osmium.filter.KeyFilter(*sorted(keys)))):
            if i % 20000 == 0:
                if cancel.is_set():
                    raise Cancelled("Import cancelled")
                progress("Scanning OpenStreetMap data", i, None)
            kind = TYPE_NAMES[obj.type_str()]
            if kind == "relation" and obj.id in wanted_rel:
                writer.add(obj)
                continue
            tags = {t.k: t.v for t in obj.tags}
            stats.candidates += 1
            sector = _first_sector(sectors, tags)
            if sector is not None:
                matched[(kind, obj.id)] = sector.id
                writer.add(obj)
    finally:
        writer.close()
    stats.matched = len(matched)
    if cancel.is_set():
        raise Cancelled("Import cancelled")

    # ---- Pass 2: coordinates and boundary polygons from the small file ----
    progress("Locating businesses", 0, stats.matched)
    polygons: dict[int, Polygon] = {}
    found: dict[tuple[str, int], tuple[dict[str, str], tuple[float, float] | None]] = {}
    area_points: dict[int, tuple[float, float] | None] = {}  # multipolygon businesses
    for obj in osmium.FileProcessor(str(small)).with_locations().with_areas():
        if obj.is_area():
            if obj.from_way():
                continue
            rel_id = obj.orig_id()
            if rel_id in wanted_rel or ("relation", rel_id) in matched:
                poly = Polygon()
                for outer in obj.outer_rings():
                    poly.add_outer([(n.lon, n.lat) for n in outer])
                    for inner in obj.inner_rings(outer):
                        poly.inners.append([(n.lon, n.lat) for n in inner])
                if rel_id in wanted_rel:
                    polygons[rel_id] = poly
                if ("relation", rel_id) in matched:
                    area_points[rel_id] = _centroid([p for r in poly.outers for p in r])
            continue
        kind = TYPE_NAMES[obj.type_str()]
        key = (kind, obj.id)
        if key not in matched:
            continue
        tags = {t.k: t.v for t in obj.tags}
        point = None
        if kind == "node" and obj.location.valid():
            point = (obj.location.lon, obj.location.lat)
        elif kind == "way":
            point = _centroid([(n.lon, n.lat) for n in obj.nodes if n.location.valid()])
        found[key] = (tags, point)  # relations get their point from the assembled area

    for (kind, osm_id), (tags, point) in list(found.items()):
        if kind == "relation" and point is None:
            found[(kind, osm_id)] = (tags, area_points.get(osm_id))

    city_poly = polygons.get(city.osm_relation_id)
    if city_poly is None:
        raise DiscoveryError(f"The boundary of {city.name} (relation {city.osm_relation_id}) is not in this PBF file")
    districts = [(wanted_rel[rid], polygons[rid]) for rid in polygons if rid != city.osm_relation_id]

    hits: list[ScanHit] = []
    for (kind, osm_id), (tags, point) in found.items():
        if point is None:
            stats.no_location += 1
            continue
        lon, lat = point
        if not city_poly.contains(lon, lat):
            stats.outside += 1
            continue
        location = next((loc for loc, poly in districts if poly.contains(lon, lat)), city)
        hits.append(ScanHit(RawOSMElement(kind, osm_id, lat, lon, tags), matched[(kind, osm_id)], location.id))
    small.unlink(missing_ok=True)
    return hits, stats


def _import_inputs(db: Session) -> tuple[list[Sector], list[Location]]:
    sectors = [s for s in db.scalars(select(Sector).order_by(Sector.id)) if s.enabled and s.osm_discovery_enabled and s.rules]
    locations = [l for l in db.scalars(select(Location)) if l.enabled]
    return sectors, locations


@dataclass
class SectorImportStats:
    matched: int = 0  # businesses inside the city matching this sector's rules
    new: int = 0
    known: int = 0  # already in the registry (identity osm_type + osm_id); decisions untouched
    known_in_other_sector: int = 0  # known businesses that keep the sector they were first imported with
    by_location: dict[str, int] = field(default_factory=dict)


@dataclass
class ImportSummary:
    run_id: int
    found: int
    new: int
    known: int
    stats: ScanStats
    data_timestamp: str | None
    by_sector: dict[str, SectorImportStats] = field(default_factory=dict)


def import_pbf(
    db: Session,
    pbf: Path,
    *,
    cancel: threading.Event | None = None,
    progress: ProgressFn | None = None,
) -> ImportSummary:
    """Scan the extract and upsert every matching business inside the configured city."""
    progress = progress or (lambda *_: None)
    info = read_pbf_info(pbf)
    sectors, locations = _import_inputs(db)
    city = next((l for l in locations if l.location_type == LocationType.CITY), None)
    run = DiscoveryRun(
        provider="PBF",
        sector_id=None,
        location_id=city.id if city else None,
        query_or_source=f"{pbf.name} (OSM data {info.data_timestamp or 'unknown date'})",
        started_at=utcnow(),
    )
    db.add(run)
    db.commit()
    run_id = run.id
    try:
        hits, stats = scan_pbf(pbf, sectors, locations, work_dir=pbf.parent, cancel=cancel, progress=progress)
        progress("Saving businesses", 0, len(hits))
        now = utcnow()
        new = known = 0
        sector_names = {s.id: s.name for s in sectors}
        location_names = {l.id: l.name for l in locations}
        by_sector: dict[str, SectorImportStats] = {}
        for i, hit in enumerate(hits):
            if cancel is not None and cancel.is_set():
                raise Cancelled("Import cancelled")
            business, is_new = upsert_business(db, normalize(hit.element), sector_id=hit.sector_id, location_id=hit.location_id, now=now)
            new += is_new
            known += not is_new
            st = by_sector.setdefault(sector_names[hit.sector_id], SectorImportStats())
            st.matched += 1
            st.new += is_new
            st.known += not is_new
            st.known_in_other_sector += (not is_new) and business.sector_id != hit.sector_id
            loc = location_names.get(hit.location_id, "Unassigned")
            st.by_location[loc] = st.by_location.get(loc, 0) + 1
            if i % 500 == 0:
                db.flush()
                progress("Saving businesses", i, len(hits))
        run.result_count, run.new_count, run.known_count = len(hits), new, known
        run.completed_at = utcnow()
        db.commit()  # one transaction: an interrupted import changes nothing
    except BaseException as exc:
        db.rollback()
        failed = db.get(DiscoveryRun, run_id)
        failed.error = str(exc) or type(exc).__name__
        failed.completed_at = utcnow()
        db.commit()
        (pbf.parent / "_import_filtered.osm.pbf").unlink(missing_ok=True)
        raise
    log.info("PBF import: %d businesses (%d new, %d known) %s", len(hits), new, known, stats)
    return ImportSummary(run_id, len(hits), new, known, stats, info.data_timestamp, by_sector)


class PBFProvider(OSMSource):
    """OSMSource over the local extract (spec §34). The bulk import uses scan_pbf directly for all sectors at once."""

    name = "PBF"

    def __init__(self, pbf: Path, db: Session) -> None:
        self.pbf = pbf
        self.db = db

    def discover(self, sector: Sector, location: Location, *, force_refresh: bool = False) -> DiscoveryResult:
        _, locations = _import_inputs(self.db)
        hits, _ = scan_pbf(self.pbf, [sector], locations, work_dir=self.pbf.parent)
        wanted = {location.id} | {l.id for l in locations if l.parent_location_id == location.id}
        elements = [h.element for h in hits if h.location_id in wanted]
        return DiscoveryResult(elements=elements, query_or_source=f"{self.pbf.name}: {sector.name} in {location.name}")
