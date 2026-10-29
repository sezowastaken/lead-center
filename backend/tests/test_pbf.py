import hashlib
import sys
import threading
from pathlib import Path

import httpx
import pytest
from sqlalchemy import func, select

from app.config import Settings
from app.models import LeadRecord, Location, OSMBusiness, OutreachEvent, Sector
from app.models.enums import CrmStage, OutreachEventType, RecordState, RejectReason
from app.schemas.business import ReviewIn
from app.schemas.crm import OutreachEventIn
from app.services.crm import service as crm
from app.services.discovery import run_discovery
from app.services.osm.pbf import files
from app.services.osm.pbf.files import Cancelled, PBFError, cleanup_partials, download_pbf, read_pbf_info, update_pbf
from app.services.osm.pbf.importer import PBFProvider, import_pbf
from app.services.osm.pbf.jobs import JobBusy, JobManager
from app.services.review import service as review
from tests.pbf_factory import DEFAULT_POIS, write_test_pbf
from tests.test_discovery import FixtureProvider


def _by_osm(db, kind, osm_id) -> OSMBusiness:
    return db.scalar(select(OSMBusiness).where(OSMBusiness.osm_type == kind, OSMBusiness.osm_id == osm_id))


# ---------- import ----------

def test_import_matches_sectors_locations_and_skips_the_rest(db, tmp_path):
    pbf = write_test_pbf(tmp_path / "osm" / "turkey-latest.osm.pbf")
    summary = import_pbf(db, pbf)
    assert (summary.found, summary.new, summary.known) == (7, 7, 0)
    assert summary.stats.outside == 1  # Ankara

    kadikoy = db.scalar(select(Location).where(Location.name == "Kadıköy"))
    istanbul = db.scalar(select(Location).where(Location.name == "Istanbul"))
    assert _by_osm(db, "node", 1001).location_id == kadikoy.id
    assert _by_osm(db, "node", 2001).location_id == istanbul.id  # inside the city, no seeded district
    assert _by_osm(db, "node", 3001) is None  # outside Istanbul
    assert _by_osm(db, "node", 5003) is None  # bus stop named "Beauty …" is not a business
    assert _by_osm(db, "node", 6001) is None  # Pet Grooming is disabled for OSM discovery
    assert _by_osm(db, "node", 5002).sector.name == "Beauty / Aesthetics"  # name regex on a clinic
    way, rel = _by_osm(db, "way", 4001), _by_osm(db, "relation", 7001)
    assert way.sector.name.startswith("Furniture") and 40.96 < way.lat < 40.961
    assert rel.sector.name == "Photography" and rel.location_id == kadikoy.id
    assert {b.record_state for b in db.scalars(select(OSMBusiness))} == {RecordState.DISCOVERED}


def test_import_preserves_all_user_state(db, tmp_path, overpass_payload):
    # Businesses first discovered through Overpass, then worked on by the user.
    sector = db.scalar(select(Sector).where(Sector.name == "Beauty / Aesthetics"))
    location = db.scalar(select(Location).where(Location.name == "Kadıköy"))
    run_discovery(db, FixtureProvider(overpass_payload), sector, location)
    rejected = _by_osm(db, "node", 1001)
    review.save_review(db, rejected, ReviewIn(notes="checked maps", website_issues=["OLD_DESIGN"]))
    review.reject(db, rejected, RejectReason.GOOD_WEBSITE, "fine")
    approved = _by_osm(db, "node", 1002)
    review.set_favorite(db, approved, True)
    lead = review.approve(db, approved)
    crm.add_event(db, lead, OutreachEventIn(event_type=OutreachEventType.OUTBOUND, message_or_note="Merhaba", new_stage=CrmStage.CONTACTED))
    before = db.scalar(select(func.count(OSMBusiness.id)))

    pois = DEFAULT_POIS + [("node", 1002, 29.055, 40.975, {"shop": "beauty", "name": "GÜZELLİK MERKEZİ"})]
    pbf = write_test_pbf(tmp_path / "osm" / "turkey-latest.osm.pbf", pois=pois)
    summary = import_pbf(db, pbf)
    assert summary.known == 2 and summary.new == 6
    assert db.scalar(select(func.count(OSMBusiness.id))) == before + 6  # no duplicate identities

    db.expire_all()
    rejected, approved = _by_osm(db, "node", 1001), _by_osm(db, "node", 1002)
    assert rejected.record_state == RecordState.REJECTED and rejected.reject_reason == RejectReason.GOOD_WEBSITE
    assert rejected.review.notes == "checked maps" and [i.issue_code for i in rejected.review.website_issues] == ["OLD_DESIGN"]
    assert rejected.times_seen == 2 and rejected.phone == "+90 216 555 12 34"  # OSM fields refreshed
    assert approved.record_state == RecordState.APPROVED and approved.favorite
    lead = db.scalar(select(LeadRecord).where(LeadRecord.business_id == approved.id))
    assert lead.stage == CrmStage.CONTACTED
    assert db.scalar(select(func.count(OutreachEvent.id))) == 2

    again = import_pbf(db, pbf)  # re-import is idempotent
    assert again.new == 0 and again.known == 8


def test_import_failure_changes_nothing(db, tmp_path):
    pbf = write_test_pbf(tmp_path / "osm" / "turkey-latest.osm.pbf")
    cancel = threading.Event()

    def progress(phase, done, total):
        if phase == "Saving businesses":
            cancel.set()

    with pytest.raises(Cancelled):
        import_pbf(db, pbf, cancel=cancel, progress=progress)
    assert db.scalar(select(func.count(OSMBusiness.id))) == 0
    assert not (pbf.parent / "_import_filtered.osm.pbf").exists()


def test_missing_city_boundary_is_a_clear_error(db, tmp_path):
    import osmium

    pbf = tmp_path / "empty.osm.pbf"
    w = osmium.SimpleWriter(str(pbf))
    w.close()
    with pytest.raises(Exception, match="boundary of Istanbul"):
        import_pbf(db, pbf)


def test_pbf_provider_implements_osm_source(db, tmp_path):
    pbf = write_test_pbf(tmp_path / "osm" / "turkey-latest.osm.pbf")
    tattoo = db.scalar(select(Sector).where(Sector.name == "Tattoo"))
    kadikoy = db.scalar(select(Location).where(Location.name == "Kadıköy"))
    result = PBFProvider(pbf, db).discover(tattoo, kadikoy)
    assert [(e.osm_type, e.osm_id) for e in result.elements] == [("node", 6002)]


# ---------- download / update ----------

URL = "https://download.example.test/europe/turkey-latest.osm.pbf"
DATED = "https://download.example.test/europe/turkey-261028.osm.pbf"


def _settings(tmp_path) -> Settings:
    return Settings(profile="sandbox", database_path=tmp_path / "db" / "t.db", osm_pbf_url=URL, osm_updates_url="https://download.example.test/europe/turkey-updates")


def _transport(payload: bytes, md5: str | None = None, *, stall: threading.Event | None = None):
    md5 = md5 if md5 is not None else hashlib.md5(payload).hexdigest()

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url == URL:
            return httpx.Response(302, headers={"location": DATED})
        if url == DATED:
            headers = {"content-length": str(len(payload)), "last-modified": "Thu, 29 Oct 2026 02:48:24 GMT"}
            if request.method == "HEAD":
                return httpx.Response(200, headers=headers)

            def body():
                for i in range(0, len(payload), 64):
                    if stall is not None:
                        stall.wait(5)
                    yield payload[i : i + 64]

            return httpx.Response(200, headers=headers, content=body())
        if url == DATED + ".md5":
            return httpx.Response(200, text=f"{md5}  turkey-261028.osm.pbf")
        if url.endswith("state.txt"):
            return httpx.Response(200, text="timestamp=2026-10-28T21\\:21\\:02Z\nsequenceNumber=4960\n")
        return httpx.Response(404)

    return httpx.MockTransport(handler)


def test_remote_info_resolves_dated_file_and_state(tmp_path):
    payload = write_test_pbf(tmp_path / "src.osm.pbf").read_bytes()
    info = files.fetch_remote_info(_settings(tmp_path), transport=_transport(payload))
    assert info.url == DATED and info.size_bytes == len(payload)
    assert info.md5 == hashlib.md5(payload).hexdigest()
    assert (info.latest_sequence, info.latest_timestamp) == (4960, "2026-10-28T21:21:02Z")


def test_download_streams_validates_and_replaces(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "CHUNK", 128)  # several chunks even for a tiny test file
    settings = _settings(tmp_path)
    payload = write_test_pbf(tmp_path / "src.osm.pbf").read_bytes()
    seen = []
    info = download_pbf(settings, cancel=threading.Event(), progress=lambda d, t: seen.append((d, t)), transport=_transport(payload))
    assert settings.pbf_file.read_bytes() == payload and info.replication_sequence == 4954
    assert seen[-1] == (len(payload), len(payload)) and len(seen) > 2  # streamed in chunks
    assert not list(settings.osm_dir.glob("*.part"))


@pytest.mark.parametrize("case", ["bad_md5", "not_a_pbf", "cancel"])
def test_failed_download_keeps_the_previous_pbf(tmp_path, case):
    settings = _settings(tmp_path)
    old = write_test_pbf(settings.pbf_file, replication=("2026-10-01T00:00:00Z", 4900, "https://x"))
    old_bytes = old.read_bytes()
    new_payload = write_test_pbf(tmp_path / "src.osm.pbf").read_bytes()
    cancel = threading.Event()
    if case == "bad_md5":
        transport, err = _transport(new_payload, md5="0" * 32), PBFError
    elif case == "not_a_pbf":
        garbage = b"<html>not a pbf</html>" * 10
        transport, err = _transport(garbage), PBFError
    else:
        transport, err = _transport(new_payload * 3), Cancelled
        cancel.set()
    with pytest.raises(err):
        download_pbf(settings, cancel=cancel, progress=lambda *_: None, transport=transport)
    assert settings.pbf_file.read_bytes() == old_bytes  # untouched
    assert not list(settings.osm_dir.glob("*.part"))


def _fake_tool(tmp_path: Path, exit_code: int, write_output: bool = True) -> list[str]:
    script = tmp_path / f"fake_up_to_date_{exit_code}.py"
    script.write_text(
        "import shutil, sys\n"
        "args = sys.argv[1:]\n"
        "out = args[args.index('-o') + 1]; src = args[-1]\n"
        f"if {write_output!r}: shutil.copyfile(src, out)\n"
        f"sys.exit({exit_code})\n",
        encoding="utf-8",
    )
    return [sys.executable, str(script)]


def test_update_uses_temp_file_and_falls_back_safely(tmp_path):
    settings = _settings(tmp_path)
    write_test_pbf(settings.pbf_file)
    original = settings.pbf_file.read_bytes()

    ok = update_pbf(settings, cancel=threading.Event(), command=_fake_tool(tmp_path, 0))
    assert ok.status == "updated" and settings.pbf_file.read_bytes() == original
    partial = update_pbf(settings, cancel=threading.Event(), command=_fake_tool(tmp_path, 1))
    assert partial.status == "partial"

    failed = update_pbf(settings, cancel=threading.Event(), command=_fake_tool(tmp_path, 3, write_output=False))
    assert failed.status == "unavailable" and "Download a fresh copy" in failed.message
    assert settings.pbf_file.read_bytes() == original
    assert not [p for p in settings.osm_dir.iterdir() if ".part" in p.name]


def test_update_without_replication_headers_offers_full_download(tmp_path):
    settings = _settings(tmp_path)
    write_test_pbf(settings.pbf_file, replication=None)
    result = update_pbf(settings, cancel=threading.Event(), command=["should-not-run"])
    assert result.status == "unavailable" and "Download a fresh copy" in result.message


def test_read_pbf_info_rejects_garbage_and_cleanup(tmp_path):
    bad = tmp_path / "osm" / "x.osm.pbf"
    bad.parent.mkdir(parents=True)
    bad.write_bytes(b"garbage")
    with pytest.raises(PBFError):
        read_pbf_info(bad)
    (bad.parent / "turkey-latest.osm.pbf.part").write_bytes(b"x")
    (bad.parent / "turkey-latest.part.osm.pbf").write_bytes(b"x")
    assert sorted(cleanup_partials(bad.parent)) == ["turkey-latest.osm.pbf.part", "turkey-latest.part.osm.pbf"]


def test_job_manager_runs_one_job_and_reports_cancel(db):
    manager = JobManager()
    gate = threading.Event()

    def slow(job, cancel):
        gate.wait(5)
        if cancel.is_set():
            raise Cancelled("Download cancelled")
        return {}

    manager.start("download", slow)
    with pytest.raises(JobBusy):
        manager.start("import", lambda j, c: {})
    assert manager.cancel()
    gate.set()
    manager.wait(5)
    assert manager.current.status == "cancelled" and manager.current.finished_at


# ---------- food sectors ----------

FOOD_POIS = [
    ("node", 8001, 29.05, 40.97, {"amenity": "fast_food", "cuisine": "burger", "name": "Moda Burger"}),
    ("node", 8002, 29.05, 40.98, {"amenity": "restaurant", "cuisine": "american;burger", "name": "Smash House"}),
    ("node", 8003, 29.06, 40.97, {"amenity": "fast_food", "cuisine": "kebab", "name": "Dürümcü"}),
    ("node", 8004, 29.06, 40.98, {"amenity": "restaurant", "cuisine": "turkish", "name": "Çiya"}),
    ("node", 8005, 29.07, 40.97, {"amenity": "cafe", "name": "Nail Cafe"}),  # a cafe, not Beauty (name regex)
    ("node", 8006, 28.95, 41.05, {"amenity": "fast_food", "name": "Şişli Burger"}),  # no cuisine tag -> Fast Food
]


def test_food_sectors_and_burger_precedence(db, tmp_path):
    pbf = write_test_pbf(tmp_path / "osm" / "turkey-latest.osm.pbf", pois=DEFAULT_POIS + FOOD_POIS)
    summary = import_pbf(db, pbf)
    sector_of = lambda oid: _by_osm(db, "node", oid).sector.name  # noqa: E731
    assert sector_of(8001) == "Burger" and sector_of(8002) == "Burger"  # beats Fast Food / Restaurants
    assert sector_of(8003) == "Fast Food" and sector_of(8006) == "Fast Food"
    assert sector_of(8004) == "Restaurants"
    assert sector_of(8005) == "Cafes"
    burger = summary.by_sector["Burger"]
    assert (burger.matched, burger.new, burger.known, burger.by_location) == (2, 2, 0, {"Kadıköy": 2})
    assert summary.by_sector["Fast Food"].by_location == {"Kadıköy": 1, "Istanbul": 1}

    again = import_pbf(db, pbf)  # re-import: no duplicates, everything already known
    assert again.by_sector["Burger"].known == 2 and again.new == 0
    assert db.scalar(select(func.count(OSMBusiness.id)).where(OSMBusiness.osm_id.in_([p[1] for p in FOOD_POIS]))) == 6


def test_known_business_keeps_its_sector_when_rules_change(db, tmp_path):
    """Identity is osm_type + osm_id; a re-import never re-classifies or duplicates an existing business."""
    first = write_test_pbf(tmp_path / "a" / "turkey-latest.osm.pbf", pois=[("node", 8100, 29.05, 40.97, {"amenity": "fast_food", "name": "Grill"})])
    import_pbf(db, first)
    assert _by_osm(db, "node", 8100).sector.name == "Fast Food"
    second = write_test_pbf(tmp_path / "b" / "turkey-latest.osm.pbf", pois=[("node", 8100, 29.05, 40.97, {"amenity": "fast_food", "cuisine": "burger", "name": "Grill"})])
    summary = import_pbf(db, second)
    assert _by_osm(db, "node", 8100).sector.name == "Fast Food"
    assert summary.by_sector["Burger"].known_in_other_sector == 1


def test_overpass_query_for_cuisine_rule(db):
    from app.services.osm.overpass.query_builder import build_query

    burger = db.scalar(select(Sector).where(Sector.name == "Burger"))
    kadikoy = db.scalar(select(Location).where(Location.name == "Kadıköy"))
    q = build_query(burger, kadikoy)
    assert 'nwr["amenity"="fast_food"]["cuisine"~"burger",i](area.searchArea);' in q
    assert 'nwr["amenity"="restaurant"]["cuisine"~"burger",i](area.searchArea);' in q


def test_seed_weights_are_initial_only(db):
    from app.seed.loader import sync_seed_data

    beauty = db.scalar(select(Sector).where(Sector.name == "Beauty / Aesthetics"))
    hair = db.scalar(select(Sector).where(Sector.name == "Hairdresser / Premium Hair Studio"))
    assert (beauty.review_weight, hair.review_weight) == (2.0, 0.6)
    beauty.review_weight = 1.1  # user edit in Settings
    db.commit()
    sync_seed_data(db)
    db.refresh(beauty)
    assert beauty.review_weight == 1.1
