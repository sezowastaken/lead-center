import json
from dataclasses import asdict
from datetime import datetime

from pydantic import BaseModel, Field

from app.models import ManualReview, OSMBusiness
from app.models.enums import (
    BusinessActive,
    CommercialValue,
    ContactDecision,
    CustomerValue,
    DemoPotential,
    InstagramStatus,
    ReachabilityChannel,
    RebrandStatus,
    RejectReason,
    SalesAngleStrength,
    VerifiedWebsiteStatus,
    WebsiteIssueCode,
)
from app.schemas.common import LocationBrief, ORMModel, SectorBrief
from app.services.review import scoring


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
    sales_angle_strength: SalesAngleStrength | None = None
    demo_potential: DemoPotential | None = None

    manual_phone: str | None = None
    manual_website: str | None = None
    manual_instagram: str | None = None
    manual_email: str | None = None
    current_brand_name: str | None = None

    notes: str | None = None


class ScoreComponentOut(BaseModel):
    key: str
    points: int
    max: int
    known: int


class ScoreReasonOut(BaseModel):
    code: str
    value: str | int | None = None


class SuitabilitySummary(BaseModel):
    """The stored score (what Lead List sorts and filters on)."""

    score: int | None
    band: str | None
    status: str
    completeness: int
    recommendation: str

    @classmethod
    def from_review(cls, r: ManualReview | None) -> "SuitabilitySummary | None":
        if r is None or r.suitability_status is None:
            return None
        return cls(
            score=r.suitability_score,
            band=r.suitability_band,
            status=r.suitability_status,
            completeness=r.suitability_completeness or 0,
            recommendation=r.suitability_recommendation or "HOLD",
        )


class SuitabilityOut(SuitabilitySummary):
    """Full result with breakdown and the reasons for the recommendation, computed fresh from the review."""

    points: int
    reasons: list[ScoreReasonOut]
    components: list[ScoreComponentOut]

    @classmethod
    def compute(cls, r: ManualReview | None) -> "SuitabilityOut | None":
        s = scoring.for_review(r)
        return cls.model_validate(asdict(s)) if s else None


class ReviewOut(ReviewIn):
    reviewed_at: datetime
    updated_at: datetime
    suitability: SuitabilityOut | None = None


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
                    "suitability": SuitabilityOut.compute(r),
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
