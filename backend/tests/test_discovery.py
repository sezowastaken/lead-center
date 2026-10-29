import httpx
from sqlalchemy import func, select

from app.config import Settings
from app.models import DiscoveryRun, Location, OSMBusiness, Sector
from app.models.enums import RecordState, RejectReason
from app.repositories.businesses import BusinessFilters, list_businesses
from app.schemas.business import ReviewIn
from app.services.discovery import run_discovery
from app.services.osm.base import DiscoveryResult, OSMSource
from app.services.osm.overpass.client import OverpassClient
from app.services.osm.overpass.provider import OverpassProvider, parse_elements
from app.services.osm.overpass.query_builder import build_query
from app.services.osm.sector_mapper import matching_rule
from app.services.review import service as review


class FixtureProvider(OSMSource):
    name = "FIXTURE"

    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def discover(self, sector, location, *, force_refresh=False):
        return DiscoveryResult(elements=parse_elements(self.payload), query_or_source="fixture")


def _beauty_kadikoy(db):
    sector = db.scalar(select(Sector).where(Sector.name == "Beauty / Aesthetics"))
    location = db.scalar(select(Location).where(Location.name == "Kadıköy"))
    return sector, location


def test_seed_is_idempotent(db):
    from app.seed.loader import sync_seed_data

    sync_seed_data(db)
    sync_seed_data(db)
    assert db.scalar(select(func.count(Sector.id))) == 14
    interior = db.scalar(select(Sector).where(Sector.name == "Interior Design"))
    assert interior.osm_discovery_enabled is False


def test_query_builder_beauty_kadikoy(db):
    sector, location = _beauty_kadikoy(db)
    q = build_query(sector, location)
    assert "area(id:3601276548)->.searchArea;" in q
    assert 'nwr["shop"="beauty"](area.searchArea);' in q
    assert 'nwr["name"~"beauty|güzellik|estetik' in q and '",i]' in q
    assert q.strip().endswith("out center tags;")


def test_sector_mapper(db):
    sector, _ = _beauty_kadikoy(db)
    assert matching_rule(sector, {"shop": "beauty"}) is not None
    assert matching_rule(sector, {"amenity": "clinic", "name": "GÜZELLİK SALONU"}) is not None
    assert matching_rule(sector, {"shop": "bakery", "name": "Fırın"}) is None


def test_discovery_dedup_and_rejection_persist(db, overpass_payload):
    sector, location = _beauty_kadikoy(db)
    provider = FixtureProvider(overpass_payload)

    run1 = run_discovery(db, provider, sector, location)
    assert run1.error is None
    # 6 raw elements: one in-run duplicate, one without tags -> 4 unique businesses
    assert (run1.result_count, run1.new_count, run1.known_count) == (4, 4, 0)

    unnamed = db.scalar(select(OSMBusiness).where(OSMBusiness.osm_id == 1003))
    assert unnamed.name is None
    way = db.scalar(select(OSMBusiness).where(OSMBusiness.osm_type == "way"))
    assert (way.lat, way.lon) == (40.98, 29.05)

    target = db.scalar(select(OSMBusiness).where(OSMBusiness.osm_id == 1001))
    review.save_review(db, target, ReviewIn(notes="Checked Maps", website_issues=["OLD_DESIGN"]))
    review.reject(db, target, RejectReason.GOOD_WEBSITE, "fine site")

    run2 = run_discovery(db, provider, sector, location)
    assert (run2.result_count, run2.new_count, run2.known_count) == (4, 0, 4)
    assert db.scalar(select(func.count(OSMBusiness.id))) == 4

    db.expire_all()
    target = db.get(OSMBusiness, target.id)
    assert target.record_state == RecordState.REJECTED
    assert target.times_seen == 2
    assert target.review.notes == "Checked Maps"

    queue, total = list_businesses(db, BusinessFilters(state="queue"))
    assert total == 3 and target.id not in {b.id for b in queue}


def test_decisions(db, overpass_payload):
    sector, location = _beauty_kadikoy(db)
    run_discovery(db, FixtureProvider(overpass_payload), sector, location)
    a, b = db.scalars(select(OSMBusiness).order_by(OSMBusiness.id).limit(2)).all()

    review.set_favorite(db, a, True)
    assert a.record_state == RecordState.FAVORITED and a.favorite
    review.set_favorite(db, a, False)
    assert a.record_state == RecordState.IN_REVIEW

    lead = review.approve(db, b)
    assert b.record_state == RecordState.APPROVED and lead.stage == "READY_TO_CONTACT"
    review.restore(db, b)
    assert b.record_state == RecordState.IN_REVIEW and b.lead_record is not None


def test_review_save_replaces_multi_selects(db, overpass_payload):
    sector, location = _beauty_kadikoy(db)
    run_discovery(db, FixtureProvider(overpass_payload), sector, location)
    b = db.scalar(select(OSMBusiness).limit(1))
    review.save_review(db, b, ReviewIn(website_issues=["SLOW", "OLD_DESIGN"], reachability=["PHONE"]))
    review.save_review(db, b, ReviewIn(website_issues=["SLOW"], reachability=["PHONE", "EMAIL"]))
    assert {i.issue_code for i in b.review.website_issues} == {"SLOW"}
    assert {c.channel for c in b.review.reachability} == {"PHONE", "EMAIL"}
    assert b.record_state == RecordState.IN_REVIEW


def test_failed_run_is_logged(db):
    sector = db.scalar(select(Sector).where(Sector.name == "Interior Design"))
    _, location = _beauty_kadikoy(db)
    run = run_discovery(db, FixtureProvider({"elements": []}), sector, location)
    assert run.error and "disabled" in run.error
    assert db.scalar(select(func.count(DiscoveryRun.id))) == 1


def test_overpass_client_cache_and_retry(tmp_path, db, overpass_payload, monkeypatch):
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        assert request.headers["User-Agent"].startswith("LeadCenter/")
        if calls["n"] == 1:
            return httpx.Response(429, headers={"Retry-After": "1"})
        return httpx.Response(200, json=overpass_payload)

    settings = Settings()
    monkeypatch.setattr(Settings, "cache_dir", property(lambda self: tmp_path / "cache"))
    sleeps: list[float] = []
    client = OverpassClient(settings, transport=httpx.MockTransport(handler), sleep=sleeps.append)
    provider = OverpassProvider(client)
    sector, location = _beauty_kadikoy(db)

    r1 = provider.discover(sector, location)
    assert not r1.from_cache and calls["n"] == 2 and sleeps == [1.0]
    r2 = provider.discover(sector, location)
    assert r2.from_cache and calls["n"] == 2  # identical query served from local cache
    r3 = provider.discover(sector, location, force_refresh=True)
    assert not r3.from_cache and calls["n"] == 3
