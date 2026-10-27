from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models import LeadRecord
from app.models.enums import ContactChannel, CrmStage, OutreachEventType
from app.schemas.business import BusinessOut
from app.schemas.common import ORMModel


class LeadUpdate(BaseModel):
    """Editable lead fields (spec §29). Stage is changed through events, never edited silently."""

    preferred_contact_channel: ContactChannel | None = None
    personalized_angle: str | None = None
    message_draft: str | None = None
    estimated_scope: str | None = None
    quoted_price: float | None = Field(default=None, ge=0)
    next_follow_up_at: date | None = None
    won_value: float | None = Field(default=None, ge=0)
    lost_reason: str | None = None


class OutreachEventIn(BaseModel):
    event_type: OutreachEventType
    channel: ContactChannel | None = None
    message_or_note: str | None = None
    event_at: datetime | None = None  # defaults to now; may be backdated
    new_stage: CrmStage | None = None  # optionally move the lead in the same step


class StageChangeIn(BaseModel):
    stage: CrmStage
    note: str | None = None


class OutreachEventOut(ORMModel):
    id: int
    event_type: str
    channel: str | None
    message_or_note: str | None
    stage_from: str | None
    stage_to: str | None
    event_at: datetime
    created_at: datetime


class LeadOut(BaseModel):
    id: int
    stage: str
    preferred_contact_channel: str | None
    personalized_angle: str | None
    message_draft: str | None
    estimated_scope: str | None
    quoted_price: float | None
    first_contact_at: datetime | None
    last_contact_at: datetime | None
    next_follow_up_at: date | None
    won_value: float | None
    lost_reason: str | None
    created_at: datetime
    updated_at: datetime
    event_count: int
    business: BusinessOut
    # Best contact data: "verified by me" overrides OSM (spec §25).
    contact_phone: str | None
    contact_website: str | None
    contact_instagram: str | None
    contact_email: str | None
    display_name: str | None
    latest_note: str | None  # most recent message/reply/note text, for list views

    @classmethod
    def from_lead(cls, lead: LeadRecord) -> "LeadOut":
        b = lead.business
        r = b.review
        bo = BusinessOut.from_business(b)
        return cls(
            id=lead.id,
            stage=lead.stage,
            preferred_contact_channel=lead.preferred_contact_channel,
            personalized_angle=lead.personalized_angle,
            message_draft=lead.message_draft,
            estimated_scope=lead.estimated_scope,
            quoted_price=lead.quoted_price,
            first_contact_at=lead.first_contact_at,
            last_contact_at=lead.last_contact_at,
            next_follow_up_at=lead.next_follow_up_at.date() if lead.next_follow_up_at else None,
            won_value=lead.won_value,
            lost_reason=lead.lost_reason,
            created_at=lead.created_at,
            updated_at=lead.updated_at,
            event_count=len(lead.events),
            business=bo,
            contact_phone=(r and r.manual_phone) or b.phone,
            contact_website=(r and r.manual_website) or b.website,
            contact_instagram=(r and r.manual_instagram) or bo.osm_instagram,
            contact_email=(r and r.manual_email) or b.email,
            display_name=(r and r.current_brand_name) or b.name,
            latest_note=next((e.message_or_note for e in lead.events if e.message_or_note), None),
        )


class LeadDetail(LeadOut):
    events: list[OutreachEventOut]

    @classmethod
    def from_lead(cls, lead: LeadRecord) -> "LeadDetail":
        base = LeadOut.from_lead(lead).model_dump()
        return cls(**base, events=[OutreachEventOut.model_validate(e) for e in lead.events])
