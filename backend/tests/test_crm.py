from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.models import Location, OSMBusiness, Sector
from app.models.enums import CrmStage, OutreachEventType, RejectReason
from app.schemas.crm import LeadDetail, LeadUpdate, OutreachEventIn
from app.services.backup import service as backups
from app.services.crm import service as crm
from app.services.dashboard import build_dashboard
from app.services.discovery import run_discovery
from app.services.review import service as review
from tests.test_discovery import FixtureProvider


def _setup(db, payload):
    sector = db.scalar(select(Sector).where(Sector.name == "Beauty / Aesthetics"))
    location = db.scalar(select(Location).where(Location.name == "Kadıköy"))
    run_discovery(db, FixtureProvider(payload), sector, location)
    return db.scalars(select(OSMBusiness).order_by(OSMBusiness.id)).all()


def test_lead_list_follows_approval(db, overpass_payload):
    a, b, *_ = _setup(db, overpass_payload)
    lead = review.approve(db, a)
    review.approve(db, b)
    assert {l.id for l in crm.list_leads(db)} == {a.lead_record.id, b.lead_record.id}

    review.restore(db, b)  # undo approval: lead hidden, record kept
    assert [l.id for l in crm.list_leads(db)] == [lead.id]
    assert b.lead_record is not None


def test_outreach_flow_and_history(db, overpass_payload):
    a, *_ = _setup(db, overpass_payload)
    lead = review.approve(db, a)

    crm.update_lead(db, lead, LeadUpdate(preferred_contact_channel="WHATSAPP", message_draft="Merhaba...", next_follow_up_at=date(2026, 11, 3)))
    sent_at = datetime(2026, 10, 27, 9, 30, tzinfo=UTC)
    crm.add_event(
        db, lead,
        OutreachEventIn(event_type=OutreachEventType.OUTBOUND, channel="WHATSAPP", message_or_note="Merhaba, exact text", event_at=sent_at, new_stage=CrmStage.CONTACTED),
    )
    assert lead.stage == CrmStage.CONTACTED
    assert lead.first_contact_at == sent_at.replace(tzinfo=None)

    crm.add_event(db, lead, OutreachEventIn(event_type=OutreachEventType.INBOUND, channel="WHATSAPP", message_or_note="Owner asked for portfolio", new_stage=CrmStage.REPLIED))
    crm.add_event(db, lead, OutreachEventIn(event_type=OutreachEventType.NOTE, message_or_note="Seen, no answer yet"))
    crm.change_stage(db, lead, CrmStage.MEETING, "Coffee Thursday")
    crm.change_stage(db, lead, CrmStage.MEETING)  # no-op: same stage, no duplicate event

    detail = LeadDetail.from_lead(lead)
    kinds = [(e.event_type, e.stage_to) for e in detail.events]
    assert len(kinds) == 6  # 3 events + 3 stage changes, newest first, nothing overwritten
    assert ("OUTBOUND", None) in kinds and ("STAGE_CHANGE", "MEETING") in kinds
    assert any(e.message_or_note == "Merhaba, exact text" for e in detail.events)
    assert detail.next_follow_up_at == date(2026, 11, 3)
    assert detail.contact_phone == a.phone


def test_dashboard_counts(db, overpass_payload):
    a, b, c, d = _setup(db, overpass_payload)
    review.reject(db, d, RejectReason.WRONG_SECTOR, None)
    review.set_favorite(db, c, True)
    lead = review.approve(db, a)
    crm.add_event(db, lead, OutreachEventIn(event_type=OutreachEventType.OUTBOUND, channel="PHONE", new_stage=CrmStage.CONTACTED))
    crm.add_event(db, lead, OutreachEventIn(event_type=OutreachEventType.INBOUND, new_stage=CrmStage.REPLIED))

    dash = build_dashboard(db)
    today = dash["today"]
    assert today["discovered"] == 4
    assert (today["reviewed"], today["rejected"], today["approved"]) == (3, 1, 1)
    assert (today["messages_sent"], today["replies"], today["contacted"], today["replied"]) == (1, 1, 1, 1)
    assert dash["totals"]["in_queue"] == 1
    assert dash["ratios"]["contact_to_reply"]["pct"] == 100.0
    assert dash["ratios"]["review_to_approve"] == {"num": 1, "den": 3, "pct": 33.3}
    assert dash["reject_reasons"] == [{"reason": "WRONG_SECTOR", "count": 1}]
    beauty = next(s for s in dash["sectors"] if s["sector"] == "Beauty / Aesthetics")
    assert (beauty["discovered"], beauty["approved"], beauty["contacted"], beauty["replied"]) == (4, 1, 1, 1)
    assert {p["stage"]: p["count"] for p in dash["pipeline"]}["REPLIED"] == 1

    # Events backdated before today don't count as today.
    crm.add_event(db, lead, OutreachEventIn(event_type=OutreachEventType.OUTBOUND, event_at=datetime.now(UTC) - timedelta(days=40)))
    assert build_dashboard(db)["today"]["messages_sent"] == 1


def test_backups_daily_and_retention(tmp_path, db):
    db_file = tmp_path / "test.db"  # created by the db fixture
    out = tmp_path / "backups"
    first = backups.ensure_daily_backup(db_file=db_file, directory=out)
    assert first is not None and first.size_bytes > 0
    assert backups.ensure_daily_backup(db_file=db_file, directory=out) is None  # once per day

    manual = backups.create_backup(manual=True, db_file=db_file, directory=out)
    assert manual.manual
    for i in range(35):  # fake older automatic backups
        (out / f"lead_center_2025-01-{(i % 28) + 1:02d}_{i:06d}.db").write_bytes(b"x")
    removed = backups.prune(out)
    remaining = backups.list_backups(out)
    assert len([b for b in remaining if not b.manual]) == 30
    assert any(b.manual for b in remaining) and first.name in {b.name for b in remaining}
    assert len(removed) == 6
