from datetime import date

import pytest
from sqlalchemy import func, select

from app.config import REPO_ROOT, USER_DATABASE, Settings, get_settings
from app.models import DiscoveryRun, LeadRecord, Location, ManualReview, OSMBusiness, OutreachEvent, Sector
from app.models.enums import CrmStage, OutreachEventType, RecordState, RejectReason
from app.schemas.business import ReviewIn
from app.schemas.crm import LeadOut, LeadUpdate, OutreachEventIn
from app.services.crm import service as crm
from app.services.dashboard import build_dashboard
from app.services.discovery import run_discovery
from app.services.maintenance import apply_reset, plan_reset
from app.services.review import service as review
from app.timeutil import local_now
from tests.test_discovery import FixtureProvider


def test_tests_never_use_the_real_database():
    assert not get_settings().is_user_database
    assert get_settings().database_file.resolve() != (REPO_ROOT / USER_DATABASE).resolve()


def test_profiles_resolve_to_separate_databases(monkeypatch):
    monkeypatch.delenv("LEAD_CENTER_DATABASE_PATH", raising=False)
    user = Settings(profile="user")
    sandbox = Settings(profile="sandbox")
    assert user.is_user_database
    assert not sandbox.is_user_database
    assert sandbox.database_file.parent != user.database_file.parent


def test_sandbox_refuses_the_real_database():
    with pytest.raises(ValueError, match="never use the real database"):
        Settings(profile="sandbox", database_path=USER_DATABASE)


def _activity(db, payload):
    sector = db.scalar(select(Sector).where(Sector.name == "Beauty / Aesthetics"))
    location = db.scalar(select(Location).where(Location.name == "Kadıköy"))
    run_discovery(db, FixtureProvider(payload), sector, location)
    a, b, c, _ = db.scalars(select(OSMBusiness).order_by(OSMBusiness.id)).all()
    review.save_review(db, a, ReviewIn(notes="n"))
    review.reject(db, b, RejectReason.OTHER, None)
    review.set_favorite(db, c, True)
    lead = review.approve(db, a)
    crm.add_event(db, lead, OutreachEventIn(event_type=OutreachEventType.OUTBOUND, message_or_note="hi", new_stage=CrmStage.CONTACTED))


def test_reset_activity_keeps_osm_businesses(db, overpass_payload):
    _activity(db, overpass_payload)
    plan = plan_reset(db, "activity")
    assert plan.counts["outreach_events"] == 2 and plan.counts["lead_records"] == 1
    assert plan.businesses_reset == 3

    apply_reset(db, "activity")
    db.expire_all()
    assert db.scalar(select(func.count(OSMBusiness.id))) == 4
    assert set(db.scalars(select(OSMBusiness.record_state))) == {RecordState.DISCOVERED}
    assert not any(db.scalars(select(OSMBusiness.favorite)))
    for model in (ManualReview, LeadRecord, OutreachEvent):
        assert db.scalar(select(func.count()).select_from(model)) == 0
    assert db.scalar(select(func.count(DiscoveryRun.id))) == 1


def test_reset_all_keeps_configuration(db, overpass_payload):
    _activity(db, overpass_payload)
    apply_reset(db, "all")
    assert db.scalar(select(func.count(OSMBusiness.id))) == 0
    assert db.scalar(select(func.count(DiscoveryRun.id))) == 0
    assert db.scalar(select(func.count(Sector.id))) == 14


def test_dashboard_follow_ups_and_lead_latest_note(db, overpass_payload):
    _activity(db, overpass_payload)
    lead = db.scalar(select(LeadRecord))
    assert build_dashboard(db)["totals"]["follow_ups_due"] == 0
    crm.update_lead(db, lead, LeadUpdate(next_follow_up_at=local_now().date()))
    totals = build_dashboard(db)["totals"]
    assert totals["follow_ups_due"] == 1 and totals["ready_to_contact"] == 0
    crm.update_lead(db, lead, LeadUpdate(next_follow_up_at=date(2999, 1, 1)))
    assert build_dashboard(db)["totals"]["follow_ups_due"] == 0
    assert LeadOut.from_lead(lead).latest_note == "hi"


def test_devtools_status_is_read_only(db, tmp_path):
    """`devtools status` must never migrate or write — it may run against the real DB while the app is open."""
    import hashlib

    from app.devtools import read_status

    path = tmp_path / "test.db"  # the db fixture's file
    db.close()
    db.get_bind().dispose()
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    out = read_status(path)
    assert "schema: 0004" in out and "businesses: 0" in out
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before


def test_health_identifies_the_process_and_index_is_never_stale():
    """LeadCenter.bat stops a running instance by the PID from /api/health; index.html must not be cached,
    or a browser keeps showing the previous build after `LeadCenter.bat rebuild`."""
    import os

    from fastapi.testclient import TestClient

    from app.config import get_settings
    from app.main import app

    client = TestClient(app)
    health = client.get("/api/health").json()
    assert health["pid"] == os.getpid() and health["started_at"]
    if (get_settings().frontend_dist_dir / "index.html").exists():
        page = client.get("/review")
        assert page.status_code == 200 and page.headers["cache-control"] == "no-cache"
