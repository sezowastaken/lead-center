from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, utcnow


class PossibleDuplicate(Base):
    """Semantic duplicate candidates (spec §7.2). Detection is P1; table exists for schema stability."""

    __tablename__ = "possible_duplicates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_a_id: Mapped[int] = mapped_column(ForeignKey("osm_businesses.id"), nullable=False)
    business_b_id: Mapped[int] = mapped_column(ForeignKey("osm_businesses.id"), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
