"""Business suitability score: how attractive one reviewed business is as a client (0–100).

This module is the single source of truth for the formula. It only reads the user's manual review
answers; it never rejects, hides or contacts anything. Unlike a sector's review_weight (which decides
how often a sector comes up during review), this evaluates one specific business.

Missing answers — and answers that mean "don't know" (NOT_CHECKED, UNCERTAIN, UNCLEAR, UNKNOWN) — add
no points and are never treated as negative answers: they lower `completeness` instead, and the score
is shown as provisional until every scoring answer is known.
"""

from dataclasses import dataclass, field
from typing import Iterable

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import ManualReview
from app.models.enums import OutreachApproach, ScoreBand, ScoreStatus

# Bump whenever the formula changes: stored scores with another version are recomputed at startup.
FORMULA_VERSION = 1

WEBSITE_POINTS = {
    "NO_INDEPENDENT_WEBSITE": 35,
    "SOCIAL_ONLY": 32,
    "BROKEN": 30,
    "THIRD_PARTY_ONLY": 29,
    "SEVERELY_OUTDATED": 27,
    "POOR": 23,
    "AVERAGE": 12,
    "GOOD": 4,
    "EXCELLENT": 0,
}
WEBSITE_MAX = 35
# Statuses where an existing site was looked at; each ticked issue adds a point there (at most +4).
HAS_WEBSITE = {"BROKEN", "SEVERELY_OUTDATED", "POOR", "AVERAGE", "GOOD", "EXCELLENT"}
ISSUE_POINT, ISSUE_BONUS_MAX = 1, 4

NO_OWN_WEBSITE = {"NO_INDEPENDENT_WEBSITE", "SOCIAL_ONLY", "THIRD_PARTY_ONLY"}
WEBSITE_NEEDS_WORK = {"BROKEN", "POOR", "SEVERELY_OUTDATED"}

COMMERCIAL_POINTS = {"HIGH": 20, "MEDIUM": 12, "LOW": 4}  # UNCLEAR = not known yet
COMMERCIAL_MAX = 20

REACH_POINTS = {"WHATSAPP": 6, "INSTAGRAM_DM": 4, "EMAIL": 2, "PHONE": 2, "WEBSITE_FORM": 1, "IN_PERSON": 1}
REACH_MAX = 15

ACTIVE_POINTS = 6  # business_active == YES
INSTAGRAM_POINTS = {"ACTIVE": 4, "INACTIVE": 0, "NOT_FOUND": 0}  # NOT_CHECKED = not known yet

CUSTOMER_POINTS = {"HIGH": 10, "MEDIUM": 6, "LOW": 2}  # UNKNOWN = not known yet
CUSTOMER_MAX = 10

SALES_ANGLE_POINTS = {"STRONG": 6, "MEDIUM": 3, "WEAK": 0}
DEMO_POINTS = {"HIGH": 4, "MEDIUM": 2, "LOW": 0}

BANDS = [(85, ScoreBand.A), (70, ScoreBand.B), (55, ScoreBand.C), (40, ScoreBand.D), (0, ScoreBand.E)]
DEMO_MIN, STRONG_MIN, MEDIUM_MIN = 85, 70, 55


@dataclass(frozen=True)
class ReviewFacts:
    """The review answers the score depends on (and nothing else)."""

    business_active: str | None = None
    verified_website_status: str | None = None
    website_issues: tuple[str, ...] = ()
    instagram_status: str | None = None
    reachability: tuple[str, ...] = ()
    commercial_value: str | None = None
    customer_value: str | None = None
    sales_angle_strength: str | None = None
    demo_potential: str | None = None

    @classmethod
    def from_review(cls, r: ManualReview) -> "ReviewFacts":
        return cls(
            business_active=r.business_active,
            verified_website_status=r.verified_website_status,
            website_issues=tuple(i.issue_code for i in r.website_issues),
            instagram_status=r.instagram_status,
            reachability=tuple(c.channel for c in r.reachability),
            commercial_value=r.commercial_value,
            customer_value=r.customer_value,
            sales_angle_strength=r.sales_angle_strength,
            demo_potential=r.demo_potential,
        )


@dataclass(frozen=True)
class Component:
    key: str  # website | commercial | reachability | activity | customer | sales
    points: int
    max: int
    known: int  # how many of `max` points are backed by a known answer (completeness share)


@dataclass(frozen=True)
class Reason:
    code: str  # INACTIVE | SCORE_AT_LEAST | SCORE_BELOW | NO_OWN_WEBSITE | WEBSITE_NEEDS_WORK | COMMERCIAL_HIGH | DEMO_HIGH | PROVISIONAL
    value: str | int | None = None


@dataclass(frozen=True)
class Suitability:
    score: int | None  # None when NOT_ELIGIBLE
    points: int  # sum of components, also kept for NOT_ELIGIBLE so the breakdown stays explainable
    band: ScoreBand | None
    status: ScoreStatus
    completeness: int  # 0–100
    recommendation: OutreachApproach
    reasons: list[Reason] = field(default_factory=list)
    components: list[Component] = field(default_factory=list)


def band_for(score: int) -> ScoreBand:
    return next(band for floor, band in BANDS if score >= floor)


def _components(f: ReviewFacts) -> list[Component]:
    ws = f.verified_website_status
    website = WEBSITE_POINTS.get(ws or "", 0)
    if ws in HAS_WEBSITE:
        website = min(WEBSITE_MAX, website + min(ISSUE_BONUS_MAX, ISSUE_POINT * len(set(f.website_issues))))

    channels = set(f.reachability)
    reach = min(REACH_MAX, sum(REACH_POINTS.get(c, 0) for c in channels))

    active_known = f.business_active in ("YES", "NO")
    instagram_known = f.instagram_status in INSTAGRAM_POINTS
    activity = (ACTIVE_POINTS if f.business_active == "YES" else 0) + INSTAGRAM_POINTS.get(f.instagram_status or "", 0)

    angle_known = f.sales_angle_strength in SALES_ANGLE_POINTS
    demo_known = f.demo_potential in DEMO_POINTS
    sales = SALES_ANGLE_POINTS.get(f.sales_angle_strength or "", 0) + DEMO_POINTS.get(f.demo_potential or "", 0)

    return [
        Component("website", website, WEBSITE_MAX, WEBSITE_MAX if ws in WEBSITE_POINTS else 0),
        Component("commercial", COMMERCIAL_POINTS.get(f.commercial_value or "", 0), COMMERCIAL_MAX, COMMERCIAL_MAX if f.commercial_value in COMMERCIAL_POINTS else 0),
        Component("reachability", reach, REACH_MAX, REACH_MAX if channels else 0),
        Component("activity", activity, ACTIVE_POINTS + 4, (ACTIVE_POINTS if active_known else 0) + (4 if instagram_known else 0)),
        Component("customer", CUSTOMER_POINTS.get(f.customer_value or "", 0), CUSTOMER_MAX, CUSTOMER_MAX if f.customer_value in CUSTOMER_POINTS else 0),
        Component("sales", sales, 10, (6 if angle_known else 0) + (4 if demo_known else 0)),
    ]


def _recommend(f: ReviewFacts, score: int | None, status: ScoreStatus) -> tuple[OutreachApproach, list[Reason]]:
    if status == ScoreStatus.NOT_ELIGIBLE or score is None:
        return OutreachApproach.HOLD, [Reason("INACTIVE")]
    ws = f.verified_website_status
    if score >= DEMO_MIN and ws in NO_OWN_WEBSITE and f.commercial_value == "HIGH" and f.demo_potential == "HIGH":
        return OutreachApproach.DEMO_FIRST, [Reason("SCORE_AT_LEAST", DEMO_MIN), Reason("NO_OWN_WEBSITE", ws), Reason("COMMERCIAL_HIGH"), Reason("DEMO_HIGH")]
    if score >= STRONG_MIN and ws in WEBSITE_NEEDS_WORK:
        return OutreachApproach.AUDIT_FIRST, [Reason("SCORE_AT_LEAST", STRONG_MIN), Reason("WEBSITE_NEEDS_WORK", ws)]
    if score >= STRONG_MIN:
        return OutreachApproach.PERSONALIZED_OUTREACH, [Reason("SCORE_AT_LEAST", STRONG_MIN)]
    if score >= MEDIUM_MIN:
        return OutreachApproach.STANDARD_OUTREACH, [Reason("SCORE_AT_LEAST", MEDIUM_MIN), Reason("SCORE_BELOW", STRONG_MIN)]
    return OutreachApproach.HOLD, [Reason("SCORE_BELOW", MEDIUM_MIN)]


def compute(f: ReviewFacts) -> Suitability | None:
    """None until at least one scoring answer has been entered."""
    components = _components(f)
    completeness = sum(c.known for c in components)
    inactive = f.business_active == "NO"
    if completeness == 0 and not inactive:
        return None
    points = sum(c.points for c in components)
    if inactive:
        status, score, band = ScoreStatus.NOT_ELIGIBLE, None, None
    else:
        status = ScoreStatus.COMPLETE if completeness == 100 else ScoreStatus.PROVISIONAL
        score, band = points, band_for(points)
    recommendation, reasons = _recommend(f, score, status)
    if status == ScoreStatus.PROVISIONAL:
        reasons.append(Reason("PROVISIONAL", completeness))
    return Suitability(score, points, band, status, completeness, recommendation, reasons, components)


def for_review(review: ManualReview | None) -> Suitability | None:
    return compute(ReviewFacts.from_review(review)) if review is not None else None


def store(review: ManualReview) -> Suitability | None:
    """Recompute and keep the stored copy (used for Lead List sorting/filtering) in sync."""
    s = for_review(review)
    review.suitability_score = s.score if s else None
    review.suitability_band = s.band.value if s and s.band else None
    review.suitability_status = s.status.value if s else None
    review.suitability_completeness = s.completeness if s else None
    review.suitability_recommendation = s.recommendation.value if s else None
    review.suitability_version = FORMULA_VERSION
    return s


def recompute_stale(db: Session, reviews: Iterable[ManualReview] | None = None) -> int:
    """Recompute every review stored with another formula version (or none). Returns how many changed."""
    if reviews is None:
        stale = or_(ManualReview.suitability_version.is_(None), ManualReview.suitability_version != FORMULA_VERSION)
        reviews = db.scalars(select(ManualReview).where(stale))
    n = 0
    for r in reviews:
        store(r)
        n += 1
    if n:
        db.commit()
    return n
