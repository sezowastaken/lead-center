from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, utcnow
from app.models.enums import CrmStage


class LeadRecord(Base):
    """Created when a business is approved. CRM screens come in the next milestone."""

    __tablename__ = "lead_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("osm_businesses.id"), nullable=False, unique=True)

    stage: Mapped[str] = mapped_column(String(30), nullable=False, default=CrmStage.READY_TO_CONTACT)
    lead_score: Mapped[int | None] = mapped_column(Integer)

    preferred_contact_channel: Mapped[str | None] = mapped_column(String(30))
    personalized_angle: Mapped[str | None] = mapped_column(Text)
    message_draft: Mapped[str | None] = mapped_column(Text)

    estimated_scope: Mapped[str | None] = mapped_column(Text)
    quoted_price: Mapped[float | None] = mapped_column(Float)

    first_contact_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_contact_at: Mapped[datetime | None] = mapped_column(DateTime)
    next_follow_up_at: Mapped[datetime | None] = mapped_column(DateTime)

    won_value: Mapped[float | None] = mapped_column(Float)
    lost_reason: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    business = relationship("OSMBusiness", back_populates="lead_record")
    events: Mapped[list["OutreachEvent"]] = relationship(
        back_populates="lead_record", order_by="OutreachEvent.event_at.desc(), OutreachEvent.id.desc()", lazy="selectin"
    )


class OutreachEvent(Base):
    """Append-only outreach history (spec §30: never overwrite history).

    Stage changes are events too (stage_from -> stage_to), so the full CRM path is reconstructable
    and the dashboard can count transitions per period.
    """

    __tablename__ = "outreach_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_record_id: Mapped[int] = mapped_column(ForeignKey("lead_records.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    channel: Mapped[str | None] = mapped_column(String(30))
    message_or_note: Mapped[str | None] = mapped_column(Text)
    stage_from: Mapped[str | None] = mapped_column(String(30))
    stage_to: Mapped[str | None] = mapped_column(String(30))
    event_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    lead_record: Mapped[LeadRecord] = relationship(back_populates="events")
