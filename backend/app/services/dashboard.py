"""Dashboard counts (spec §31, §51). Plain counts and ratios — no scoring."""

from collections import defaultdict
from datetime import datetime, time

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import LeadRecord, OSMBusiness, Sector
from app.models.crm import OutreachEvent
from app.models.enums import CrmStage, OutreachEventType, RecordState
from app.timeutil import local_now, month_start_utc, today_start_utc

DECIDED_STATES = (RecordState.REJECTED, RecordState.FAVORITED, RecordState.APPROVED)


def _count(db: Session, stmt) -> int:
    return db.scalar(stmt) or 0


def reviewed_since(db: Session, since: datetime) -> int:
    """Businesses that received a decision since `since` (same definition as the dashboard's "reviewed")."""
    return _count(
        db, select(func.count(OSMBusiness.id)).where(OSMBusiness.decided_at >= since, OSMBusiness.record_state.in_(DECIDED_STATES))
    )


def _businesses_since(db: Session, since: datetime) -> dict[str, int]:
    discovered = _count(db, select(func.count(OSMBusiness.id)).where(OSMBusiness.first_seen_at >= since))
    by_state = dict(
        db.execute(
            select(OSMBusiness.record_state, func.count(OSMBusiness.id))
            .where(OSMBusiness.decided_at >= since, OSMBusiness.record_state.in_(DECIDED_STATES))
            .group_by(OSMBusiness.record_state)
        ).all()
    )
    return {
        "discovered": discovered,
        # A business counts as reviewed when it received a decision in the period (its latest decision).
        "reviewed": sum(by_state.values()),
        "rejected": by_state.get(RecordState.REJECTED, 0),
        "favorited": by_state.get(RecordState.FAVORITED, 0),
        "approved": by_state.get(RecordState.APPROVED, 0),
    }


def _outreach_since(db: Session, since: datetime) -> dict[str, int]:
    events = db.execute(
        select(OutreachEvent.event_type, OutreachEvent.stage_to, OutreachEvent.lead_record_id).where(OutreachEvent.event_at >= since)
    ).all()
    sent = sum(1 for e in events if e.event_type == OutreachEventType.OUTBOUND)
    replies = sum(1 for e in events if e.event_type == OutreachEventType.INBOUND)

    def leads_moved_to(stage: CrmStage) -> int:
        return len({e.lead_record_id for e in events if e.stage_to == stage})

    contacted = _count(db, select(func.count(LeadRecord.id)).where(LeadRecord.first_contact_at >= since))
    return {
        "messages_sent": sent,
        "replies": replies,
        "contacted": contacted,
        "replied": leads_moved_to(CrmStage.REPLIED),
        "meetings": leads_moved_to(CrmStage.MEETING),
        "offers": leads_moved_to(CrmStage.OFFER_SENT),
        "wins": leads_moved_to(CrmStage.WON),
        "losses": leads_moved_to(CrmStage.LOST),
    }


def _reached_stages(db: Session) -> dict[int, set[str]]:
    """Every stage each lead has ever been in (event history + current stage)."""
    reached: dict[int, set[str]] = defaultdict(set)
    for lead_id, stage in db.execute(select(LeadRecord.id, LeadRecord.stage)).all():
        reached[lead_id].add(stage)
    for lead_id, stage_to, event_type in db.execute(
        select(OutreachEvent.lead_record_id, OutreachEvent.stage_to, OutreachEvent.event_type)
    ).all():
        if stage_to:
            reached[lead_id].add(stage_to)
        if event_type == OutreachEventType.OUTBOUND:
            reached[lead_id].add(CrmStage.CONTACTED)
        if event_type == OutreachEventType.INBOUND:
            reached[lead_id].add(CrmStage.REPLIED)
    return reached


def _ratio(num: int, den: int) -> dict:
    return {"num": num, "den": den, "pct": round(100 * num / den, 1) if den else None}


def build_dashboard(db: Session) -> dict:
    today = today_start_utc()
    month = month_start_utc()

    reached = _reached_stages(db)
    n = lambda stage: sum(1 for s in reached.values() if stage in s)  # noqa: E731
    decided = dict(
        db.execute(
            select(OSMBusiness.record_state, func.count(OSMBusiness.id))
            .where(OSMBusiness.record_state.in_(DECIDED_STATES))
            .group_by(OSMBusiness.record_state)
        ).all()
    )
    total_decided = sum(decided.values())
    contacted, replied, meeting, offer, won = (
        n(CrmStage.CONTACTED), n(CrmStage.REPLIED), n(CrmStage.MEETING), n(CrmStage.OFFER_SENT), n(CrmStage.WON),
    )

    # Sector performance (spec §31: visible once data exists).
    sector_rows: dict[int | None, dict] = {}
    for sector_id, name, state, count in db.execute(
        select(OSMBusiness.sector_id, Sector.name, OSMBusiness.record_state, func.count(OSMBusiness.id))
        .outerjoin(Sector, OSMBusiness.sector_id == Sector.id)
        .group_by(OSMBusiness.sector_id, Sector.name, OSMBusiness.record_state)
    ).all():
        row = sector_rows.setdefault(
            sector_id,
            {"sector": name or "—", "discovered": 0, "rejected": 0, "approved": 0, "contacted": 0, "replied": 0, "won": 0},
        )
        row["discovered"] += count
        if state == RecordState.REJECTED:
            row["rejected"] += count
        if state == RecordState.APPROVED:
            row["approved"] += count
    for lead_id, sector_id in db.execute(
        select(LeadRecord.id, OSMBusiness.sector_id).join(OSMBusiness, LeadRecord.business_id == OSMBusiness.id)
    ).all():
        row = sector_rows.get(sector_id)
        if row is None:
            continue
        for stage, key in ((CrmStage.CONTACTED, "contacted"), (CrmStage.REPLIED, "replied"), (CrmStage.WON, "won")):
            if stage in reached.get(lead_id, set()):
                row[key] += 1

    reject_reasons = [
        {"reason": reason or "UNSPECIFIED", "count": count}
        for reason, count in db.execute(
            select(OSMBusiness.reject_reason, func.count(OSMBusiness.id))
            .where(OSMBusiness.record_state == RecordState.REJECTED)
            .group_by(OSMBusiness.reject_reason)
            .order_by(func.count(OSMBusiness.id).desc())
        ).all()
    ]

    pipeline = dict(
        db.execute(
            select(LeadRecord.stage, func.count(LeadRecord.id))
            .join(OSMBusiness, LeadRecord.business_id == OSMBusiness.id)
            .where(OSMBusiness.record_state == RecordState.APPROVED)
            .group_by(LeadRecord.stage)
        ).all()
    )

    return {
        "today": {**_businesses_since(db, today), **_outreach_since(db, today)},
        "month": {**_businesses_since(db, month), **_outreach_since(db, month)},
        "totals": {
            "businesses": _count(db, select(func.count(OSMBusiness.id))),
            "ready_to_contact": pipeline.get(CrmStage.READY_TO_CONTACT, 0),
            # next_follow_up_at holds an Istanbul calendar date (see crm.service.update_lead).
            "follow_ups_due": _count(
                db,
                select(func.count(LeadRecord.id))
                .join(OSMBusiness, LeadRecord.business_id == OSMBusiness.id)
                .where(
                    OSMBusiness.record_state == RecordState.APPROVED,
                    LeadRecord.stage.not_in((CrmStage.WON, CrmStage.LOST)),
                    LeadRecord.next_follow_up_at <= datetime.combine(local_now().date(), time.min),
                ),
            ),
            "in_queue": _count(
                db,
                select(func.count(OSMBusiness.id)).where(
                    OSMBusiness.record_state.in_((RecordState.DISCOVERED, RecordState.IN_REVIEW))
                ),
            ),
            "favorites": decided.get(RecordState.FAVORITED, 0),
            "rejected": decided.get(RecordState.REJECTED, 0),
            "approved": decided.get(RecordState.APPROVED, 0),
        },
        "pipeline": [{"stage": s.value, "count": pipeline.get(s, 0)} for s in CrmStage],
        "ratios": {
            "review_to_approve": _ratio(decided.get(RecordState.APPROVED, 0), total_decided),
            "contact_to_reply": _ratio(replied, contacted),
            "reply_to_meeting": _ratio(meeting, replied),
            "meeting_to_offer": _ratio(offer, meeting),
            "offer_to_win": _ratio(won, offer),
            "contact_to_win": _ratio(won, contacted),
        },
        "sectors": sorted(sector_rows.values(), key=lambda r: (-r["approved"], -r["discovered"])),
        "reject_reasons": reject_reasons,
    }
