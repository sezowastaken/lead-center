from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, utcnow


class ManualReview(Base):
    """The user's own research result for a business — "Verified by me" (spec §24–26)."""

    __tablename__ = "manual_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("osm_businesses.id"), nullable=False, unique=True)

    business_active: Mapped[str | None] = mapped_column(String(20))
    rebrand_status: Mapped[str | None] = mapped_column(String(20))

    verified_website_status: Mapped[str | None] = mapped_column(String(30))
    instagram_status: Mapped[str | None] = mapped_column(String(20))

    commercial_value: Mapped[str | None] = mapped_column(String(20))
    customer_value: Mapped[str | None] = mapped_column(String(20))

    contact_decision: Mapped[str | None] = mapped_column(String(20))

    manual_phone: Mapped[str | None] = mapped_column(Text)
    manual_website: Mapped[str | None] = mapped_column(Text)
    manual_instagram: Mapped[str | None] = mapped_column(Text)
    manual_email: Mapped[str | None] = mapped_column(Text)
    current_brand_name: Mapped[str | None] = mapped_column(Text)

    notes: Mapped[str | None] = mapped_column(Text)

    reviewed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    business = relationship("OSMBusiness", back_populates="review")
    website_issues: Mapped[list["WebsiteIssue"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    reachability: Mapped[list["ReviewReachability"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )


class WebsiteIssue(Base):
    __tablename__ = "website_issues"
    __table_args__ = (UniqueConstraint("manual_review_id", "issue_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    manual_review_id: Mapped[int] = mapped_column(
        ForeignKey("manual_reviews.id", ondelete="CASCADE"), nullable=False, index=True
    )
    issue_code: Mapped[str] = mapped_column(String(40), nullable=False)


class ReviewReachability(Base):
    """Reachability checkboxes from spec §24 (same pattern as website_issues)."""

    __tablename__ = "review_reachability"
    __table_args__ = (UniqueConstraint("manual_review_id", "channel"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    manual_review_id: Mapped[int] = mapped_column(
        ForeignKey("manual_reviews.id", ondelete="CASCADE"), nullable=False, index=True
    )
    channel: Mapped[str] = mapped_column(String(30), nullable=False)
