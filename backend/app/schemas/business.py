import json
from datetime import datetime

from pydantic import BaseModel, Field

from app.models import OSMBusiness
from app.models.enums import (
    BusinessActive,
    CommercialValue,
    ContactDecision,
    CustomerValue,
    InstagramStatus,
    ReachabilityChannel,
    RebrandStatus,
    RejectReason,
    VerifiedWebsiteStatus,
    WebsiteIssueCode,
)
from app.schemas.common import LocationBrief, ORMModel, SectorBrief


class ReviewIn(BaseModel):
    """Manual checklist (spec §24), overrides (§25) and notes (§26). Every field is optional."""

    business_active: BusinessActive | None = None
    rebrand_status: RebrandStatus | None = None
    verified_website_status: VerifiedWebsiteStatus | None = None
    website_issues: list[WebsiteIssueCode] = []
    instagram_status: InstagramStatus | None = None
    reachability: list[ReachabilityChannel] = []
    commercial_value: CommercialValue | None = None
    customer_value: CustomerValue | None = None
    contact_decision: ContactDecision | None = None

    manual_phone: str | None = None
    manual_website: str | None = None
    manual_instagram: str | None = None
    manual_email: str | None = None
    current_brand_name: str | None = None

    notes: str | None = None


class ReviewOut(ReviewIn):
    reviewed_at: datetime
    updated_at: datetime


class RejectIn(BaseModel):
    reason: RejectReason
    note: str | None = None


class FavoriteIn(BaseModel):
    favorite: bool


class BusinessOut(ORMModel):
    id: int
    osm_type: str
    osm_id: int
    osm_url: str
    name: str | None
    name_source: str | None
    lat: float | None
    lon: float | None

    # OSM data — None means "not recorded in OSM" (UNKNOWN), never "does not exist".
    phone: str | None
    phone_raw: str | None
    website: str | None
    email: str | None
    opening_hours: str | None
    address_text: str | None
    osm_instagram: str | None
    osm_facebook: str | None
    normalized_website_type: str

    sector: SectorBrief | None
    location: LocationBrief | None

    first_seen_at: datetime
    last_seen_at: datetime
    times_seen: int

    record_state: str
    favorite: bool
    reject_reason: str | None
    reject_note: str | None
    decided_at: datetime | None

    has_review: bool
    has_notes: bool
    lead_record_id: int | None

    @classmethod
    def from_business(cls, b: OSMBusiness) -> "BusinessOut":
        tags = json.loads(b.raw_tags_json or "{}")
        return cls.model_validate(
            {
                **{k: getattr(b, k) for k in _DIRECT_FIELDS},
                "osm_url": f"https://www.openstreetmap.org/{b.osm_type}/{b.osm_id}",
                "osm_instagram": tags.get("contact:instagram") or tags.get("instagram"),
                "osm_facebook": tags.get("contact:facebook") or tags.get("facebook"),
                "sector": b.sector,
                "location": b.location,
                "has_review": b.review is not None,
                "has_notes": bool(b.review and b.review.notes and b.review.notes.strip()),
                "lead_record_id": b.lead_record.id if b.lead_record else None,
            }
        )


_DIRECT_FIELDS = (
    "id", "osm_type", "osm_id", "name", "name_source", "lat", "lon", "phone", "phone_raw", "website",
    "email", "opening_hours", "address_text", "normalized_website_type", "first_seen_at", "last_seen_at",
    "times_seen", "record_state", "favorite", "reject_reason", "reject_note", "decided_at",
)


class BusinessDetail(BusinessOut):
    raw_tags: dict[str, str]
    review: ReviewOut | None

    @classmethod
    def from_business(cls, b: OSMBusiness) -> "BusinessDetail":
        base = BusinessOut.from_business(b).model_dump()
        review = None
        if b.review is not None:
            r = b.review
            review = ReviewOut.model_validate(
                {
                    **{k: getattr(r, k) for k in ReviewIn.model_fields if k not in ("website_issues", "reachability")},
                    "website_issues": [i.issue_code for i in r.website_issues],
                    "reachability": [c.channel for c in r.reachability],
                    "reviewed_at": r.reviewed_at,
                    "updated_at": r.updated_at,
                }
            )
        return cls.model_validate({**base, "raw_tags": json.loads(b.raw_tags_json or "{}"), "review": review})


class BusinessPage(BaseModel):
    items: list[BusinessOut]
    total: int
    limit: int
    offset: int


class QueueNext(BaseModel):
    business: BusinessDetail | None
    remaining: int = Field(description="Businesses left in the normal review queue for these filters")
