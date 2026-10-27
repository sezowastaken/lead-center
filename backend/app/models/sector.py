from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Sector(Base):
    __tablename__ = "sectors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    # Two independent properties (spec §10): poor OSM coverage != poor commercial opportunity.
    commercial_priority: Mapped[str] = mapped_column(String(20), nullable=False)
    osm_coverage: Mapped[str] = mapped_column(String(30), nullable=False)
    osm_discovery_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text)

    rules: Mapped[list["SectorRule"]] = relationship(
        back_populates="sector", cascade="all, delete-orphan", order_by="SectorRule.priority", lazy="selectin"
    )


class SectorRule(Base):
    __tablename__ = "sector_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sector_id: Mapped[int] = mapped_column(ForeignKey("sectors.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_type: Mapped[str] = mapped_column(String(30), nullable=False)
    tag_key: Mapped[str | None] = mapped_column(String(100))
    tag_value: Mapped[str | None] = mapped_column(String(100))
    regex: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    sector: Mapped[Sector] = relationship(back_populates="rules")
