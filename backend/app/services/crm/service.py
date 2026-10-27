"""Lead List + simple CRM + outreach history (spec §20, §29, §30).

All outreach is sent manually by the user; this only records it. Events are append-only.
"""

from datetime import datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import utcnow
from app.models import LeadRecord, OSMBusiness
from app.models.enums import CrmStage, OutreachEventType, RecordState
from app.models.crm import OutreachEvent
from app.schemas.crm import LeadUpdate, OutreachEventIn
from app.timeutil import to_utc_naive


def list_leads(db: Session, *, stage: str | None = None, sector_id: int | None = None, q: str | None = None) -> list[LeadRecord]:
    """Leads whose business is currently APPROVED (an undone approval hides the lead but keeps its history)."""
    stmt = (
        select(LeadRecord)
        .join(OSMBusiness, LeadRecord.business_id == OSMBusiness.id)
        .where(OSMBusiness.record_state == RecordState.APPROVED)
    )
    if stage:
        stmt = stmt.where(LeadRecord.stage == stage)
    if sector_id is not None:
        stmt = stmt.where(OSMBusiness.sector_id == sector_id)
    if q:
        stmt = stmt.where(OSMBusiness.name.ilike(f"%{q.strip()}%"))
    stmt = stmt.order_by(LeadRecord.next_follow_up_at.is_(None), LeadRecord.next_follow_up_at, LeadRecord.updated_at.desc())
    return list(db.scalars(stmt).unique())


def update_lead(db: Session, lead: LeadRecord, data: LeadUpdate) -> None:
    for field, value in data.model_dump().items():
        if isinstance(value, str):
            value = value.strip() or None
        if field == "next_follow_up_at" and value is not None:
            value = datetime.combine(value, time.min)  # an Istanbul calendar date
        setattr(lead, field, value)
    lead.updated_at = utcnow()
    db.commit()


def _change_stage(db: Session, lead: LeadRecord, new_stage: CrmStage, when: datetime, note: str | None) -> None:
    if new_stage == lead.stage:
        return
    db.add(
        OutreachEvent(
            lead_record_id=lead.id,
            event_type=OutreachEventType.STAGE_CHANGE,
            stage_from=lead.stage,
            stage_to=new_stage,
            message_or_note=note,
            event_at=when,
        )
    )
    lead.stage = new_stage


def change_stage(db: Session, lead: LeadRecord, new_stage: CrmStage, note: str | None = None) -> None:
    _change_stage(db, lead, new_stage, utcnow(), (note or "").strip() or None)
    lead.updated_at = utcnow()
    db.commit()
    db.refresh(lead)


def add_event(db: Session, lead: LeadRecord, data: OutreachEventIn) -> OutreachEvent:
    when = to_utc_naive(data.event_at) if data.event_at else utcnow()
    event = OutreachEvent(
        lead_record_id=lead.id,
        event_type=data.event_type,
        channel=data.channel,
        message_or_note=(data.message_or_note or "").strip() or None,
        event_at=when,
    )
    db.add(event)
    if data.event_type in (OutreachEventType.OUTBOUND, OutreachEventType.INBOUND):
        if data.event_type == OutreachEventType.OUTBOUND and (lead.first_contact_at is None or when < lead.first_contact_at):
            lead.first_contact_at = when
        if lead.last_contact_at is None or when > lead.last_contact_at:
            lead.last_contact_at = when
    if data.new_stage is not None:
        _change_stage(db, lead, data.new_stage, when, None)
    lead.updated_at = utcnow()
    db.commit()
    db.refresh(lead)
    return event
