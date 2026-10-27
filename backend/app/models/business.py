from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, utcnow
from app.models.enums import RecordState, WebsiteType


class OSMBusiness(Base):
    """Permanent business registry. Rows are never physically deleted (spec §3.4)."""

    __tablename__ = "osm_businesses"
    __table_args__ = (UniqueConstraint("osm_type", "osm_id", name="uq_osm_identity"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    osm_type: Mapped[str] = mapped_column(String(10), nullable=False)
    osm_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # NULL means "not recorded in OSM" — never "does not exist" (spec §3.2).
    name: Mapped[str | None] = mapped_column(Text)
    name_source: Mapped[str | None] = mapped_column(String(20))

    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)

    phone: Mapped[str | None] = mapped_column(Text)
    phone_raw: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    opening_hours: Mapped[str | None] = mapped_column(Text)
    address_text: Mapped[str | None] = mapped_column(Text)

    raw_tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    normalized_website_type: Mapped[str] = mapped_column(String(30), nullable=False, default=WebsiteType.UNKNOWN)
    sector_id: Mapped[int | None] = mapped_column(ForeignKey("sectors.id"), index=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), index=True)

    first_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    times_seen: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    record_state: Mapped[str] = mapped_column(String(20), nullable=False, default=RecordState.DISCOVERED, index=True)
    favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reject_reason: Mapped[str | None] = mapped_column(String(30))
    reject_note: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    sector = relationship("Sector", lazy="joined")
    location = relationship("Location", lazy="joined")
    review = relationship("ManualReview", back_populates="business", uselist=False, lazy="selectin")
    lead_record = relationship("LeadRecord", back_populates="business", uselist=False, lazy="selectin")
