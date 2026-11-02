"""Business suitability score (services/review/scoring.py)."""

import pytest
from sqlalchemy import select, update

from app.models import Location, ManualReview, OSMBusiness, Sector
from app.models.enums import OutreachApproach as A, RecordState, ScoreBand, ScoreStatus, WebsiteIssueCode
from app.schemas.business import BusinessDetail, ReviewIn
from app.schemas.crm import LeadDetail, LeadOut
from app.services.crm import service as crm
from app.services.discovery import run_discovery
from app.services.review import scoring
from app.services.review import service as review
from app.services.review.scoring import ReviewFacts, band_for, compute
from tests.test_discovery import FixtureProvider

# Every scoring answer filled in, best case; tests override single answers.
HIGH_FIT = dict(
    business_active="YES",
    verified_website_status="NO_INDEPENDENT_WEBSITE",
    instagram_status="ACTIVE",
    reachability=("WHATSAPP", "INSTAGRAM_DM", "EMAIL", "PHONE"),
    commercial_value="HIGH",
    customer_value="HIGH",
    sales_angle_strength="STRONG",
    demo_potential="HIGH",
)


def facts(**overrides) -> ReviewFacts:
    return ReviewFacts(**{**HIGH_FIT, **overrides})


def parts(s) -> dict[str, int]:
    return {c.key: c.points for c in s.components}


def codes(s) -> list[str]:
    return [r.code for r in s.reasons]


def test_high_fit_no_website_lead():
    s = compute(facts())
    assert parts(s) == {"website": 35, "commercial": 20, "reachability": 14, "activity": 10, "customer": 10, "sales": 10}
    assert (s.score, s.band, s.status, s.completeness) == (99, ScoreBand.A, ScoreStatus.COMPLETE, 100)
    assert s.recommendation == A.DEMO_FIRST
    assert codes(s) == ["SCORE_AT_LEAST", "NO_OWN_WEBSITE", "COMMERCIAL_HIGH", "DEMO_HIGH"]


def test_poor_existing_website_gets_an_audit():
    s = compute(
        facts(
            verified_website_status="POOR",
            website_issues=("OLD_DESIGN", "POOR_MOBILE", "MISSING_CTA"),
            reachability=("WHATSAPP", "INSTAGRAM_DM"),
            customer_value="MEDIUM",
            sales_angle_strength="MEDIUM",
            demo_potential="MEDIUM",
        )
    )
    assert parts(s)["website"] == 23 + 3  # issues refine the component
    assert (s.score, s.band) == (77, ScoreBand.B)
    assert s.recommendation == A.AUDIT_FIRST
    assert codes(s) == ["SCORE_AT_LEAST", "WEBSITE_NEEDS_WORK"]


@pytest.mark.parametrize(("status", "base"), [("GOOD", 4), ("EXCELLENT", 0)])
def test_good_or_excellent_website_scores_low(status, base):
    s = compute(
        facts(
            verified_website_status=status,
            website_issues=("SLOW", "OLD_CONTENT", "NO_ENGLISH", "BROKEN_LINKS", "SLOW", "OTHER", "MISSING_CTA"),
            reachability=("PHONE",),
            commercial_value="LOW",
            instagram_status="NOT_FOUND",
            customer_value="LOW",
            sales_angle_strength="WEAK",
            demo_potential="LOW",
        )
    )
    assert parts(s)["website"] == base + 4  # at most +4 from issues (duplicates count once)
    assert s.status == ScoreStatus.COMPLETE  # NOT_FOUND / WEAK / LOW are real answers
    assert s.score == base + 4 + 4 + 2 + 6 + 2 and s.band == ScoreBand.E
    assert s.recommendation == A.HOLD


def test_website_component_is_capped_and_issues_only_refine_existing_sites():
    assert parts(compute(facts(verified_website_status="BROKEN", website_issues=("SLOW", "OLD_DESIGN", "POOR_MOBILE", "BROKEN_LINKS", "OTHER"))))["website"] == 34
    for status, points in scoring.WEBSITE_POINTS.items():
        s = compute(facts(verified_website_status=status, website_issues=tuple(WebsiteIssueCode)))
        assert parts(s)["website"] <= 35
        if status in scoring.NO_OWN_WEBSITE:
            assert parts(s)["website"] == points  # no site to have issues


def test_inactive_business_is_not_eligible_but_not_rejected(db, overpass_payload):
    s = compute(facts(business_active="NO"))
    assert (s.score, s.band, s.status) == (None, None, ScoreStatus.NOT_ELIGIBLE)
    assert s.recommendation == A.HOLD and codes(s) == ["INACTIVE"]
    assert s.points == 93  # breakdown stays explainable

    b = _businesses(db, overpass_payload)[0]
    review.save_review(db, b, ReviewIn(business_active="NO", verified_website_status="NO_INDEPENDENT_WEBSITE"))
    assert b.record_state == RecordState.IN_REVIEW  # the score never decides
    assert b.review.suitability_status == "NOT_ELIGIBLE" and b.review.suitability_score is None


def test_incomplete_review_is_provisional_and_missing_is_not_negative():
    assert compute(ReviewFacts()) is None  # nothing entered yet: no score
    s = compute(ReviewFacts(verified_website_status="NO_INDEPENDENT_WEBSITE", commercial_value="HIGH"))
    assert (s.score, s.completeness, s.status) == (55, 55, ScoreStatus.PROVISIONAL)
    assert s.reasons[-1].code == "PROVISIONAL" and s.reasons[-1].value == 55

    # "don't know" answers add nothing and do not count as answered
    unsure = compute(ReviewFacts(verified_website_status="NOT_CHECKED", business_active="UNCERTAIN", commercial_value="UNCLEAR", customer_value="UNKNOWN", instagram_status="NOT_CHECKED"))
    assert unsure is None

    one_missing = compute(facts(demo_potential=None))
    assert (one_missing.score, one_missing.completeness, one_missing.status) == (95, 96, ScoreStatus.PROVISIONAL)


def test_multiple_reachability_channels_are_capped():
    assert parts(compute(facts(reachability=("WHATSAPP",))))["reachability"] == 6
    assert parts(compute(facts(reachability=("WHATSAPP", "INSTAGRAM_DM", "PHONE"))))["reachability"] == 12
    everything = ("WHATSAPP", "INSTAGRAM_DM", "EMAIL", "PHONE", "WEBSITE_FORM", "IN_PERSON", "WHATSAPP")
    assert parts(compute(facts(reachability=everything)))["reachability"] == 15


@pytest.mark.parametrize(
    ("score", "band"),
    [(100, "A"), (85, "A"), (84, "B"), (70, "B"), (69, "C"), (55, "C"), (54, "D"), (40, "D"), (39, "E"), (0, "E")],
)
def test_score_band_boundaries(score, band):
    assert band_for(score) == band


def test_outreach_recommendation_rules():
    # Demo first needs all four: score >= 85, no own website, commercial HIGH, demo HIGH
    assert compute(facts(demo_potential="MEDIUM")).recommendation == A.PERSONALIZED_OUTREACH  # 97
    assert compute(facts(commercial_value="MEDIUM")).recommendation == A.PERSONALIZED_OUTREACH  # 91
    weaker = compute(facts(verified_website_status="SOCIAL_ONLY", reachability=("WHATSAPP",), sales_angle_strength="WEAK"))
    assert weaker.score == 82 and weaker.recommendation == A.PERSONALIZED_OUTREACH

    # Broken / poor / severely outdated sites with a strong score → audit, even at A
    assert compute(facts(verified_website_status="BROKEN")).recommendation == A.AUDIT_FIRST
    # An average site is not "needs work"
    assert compute(facts(verified_website_status="AVERAGE")).recommendation == A.PERSONALIZED_OUTREACH  # 76

    standard = compute(facts(verified_website_status="AVERAGE", customer_value="LOW", sales_angle_strength="MEDIUM"))
    assert standard.score == 65 and standard.recommendation == A.STANDARD_OUTREACH
    hold = compute(facts(verified_website_status="GOOD", customer_value="LOW", commercial_value="MEDIUM"))
    assert hold.score == 52 and hold.recommendation == A.HOLD
    # recommendation is computed (and flagged) for provisional scores too
    provisional = compute(ReviewFacts(verified_website_status="NO_INDEPENDENT_WEBSITE", commercial_value="HIGH", reachability=("WHATSAPP", "INSTAGRAM_DM", "EMAIL", "PHONE")))
    assert provisional.score == 69 and provisional.recommendation == A.STANDARD_OUTREACH and "PROVISIONAL" in codes(provisional)


# ---------- stored copy, Lead List, API shapes ----------


def _businesses(db, payload=None):
    if payload is not None:
        sector = db.scalar(select(Sector).where(Sector.name == "Beauty / Aesthetics"))
        location = db.scalar(select(Location).where(Location.name == "Kadıköy"))
        run_discovery(db, FixtureProvider(payload), sector, location)
    return db.scalars(select(OSMBusiness).order_by(OSMBusiness.id)).all()


def _review(**overrides) -> ReviewIn:
    data = {**HIGH_FIT, **overrides}
    data["reachability"] = list(data["reachability"])
    return ReviewIn(**data)


def test_saved_reviews_store_the_score_and_lead_list_sorts_and_filters(db, overpass_payload):
    a, b, c, d, *_ = _businesses(db, overpass_payload)
    review.save_review(db, a, _review(verified_website_status="GOOD", customer_value="LOW", commercial_value="MEDIUM"))  # 52 D
    review.save_review(db, b, _review())  # 99 A
    review.save_review(db, c, _review(business_active="NO"))  # not eligible
    for x in (a, b, c, d):  # d approved without any review
        review.approve(db, x)

    assert (b.review.suitability_score, b.review.suitability_band, b.review.suitability_recommendation) == (99, "A", "DEMO_FIRST")
    assert b.review.suitability_version == scoring.FORMULA_VERSION

    by_score = [l.business_id for l in crm.list_leads(db, sort="score")]
    assert by_score[:2] == [b.id, a.id] and set(by_score[2:]) == {c.id, d.id}
    assert [l.business_id for l in crm.list_leads(db, band="A")] == [b.id]
    assert [l.business_id for l in crm.list_leads(db, band="NOT_ELIGIBLE")] == [c.id]
    assert [l.business_id for l in crm.list_leads(db, band="NONE")] == [d.id]
    assert [l.business_id for l in crm.list_leads(db, recommendation="HOLD", sort="score")] == [a.id, c.id]

    # re-saving recalculates
    review.save_review(db, a, _review(verified_website_status="POOR"))
    assert a.review.suitability_recommendation == "AUDIT_FIRST"

    out = LeadOut.from_lead(b.lead_record)
    assert out.suitability.model_dump() == {"score": 99, "band": "A", "status": "COMPLETE", "completeness": 100, "recommendation": "DEMO_FIRST"}
    detail = LeadDetail.from_lead(b.lead_record)
    assert [(p.key, p.points, p.max) for p in detail.suitability.components][0] == ("website", 35, 35)
    assert [r.code for r in detail.suitability.reasons] == ["SCORE_AT_LEAST", "NO_OWN_WEBSITE", "COMMERCIAL_HIGH", "DEMO_HIGH"]
    assert LeadOut.from_lead(d.lead_record).suitability is None

    review_out = BusinessDetail.from_business(b).review
    assert review_out.sales_angle_strength == "STRONG" and review_out.suitability.score == 99


def test_stale_scores_are_recomputed_from_review_data(db, overpass_payload):
    a, *_ = _businesses(db, overpass_payload)
    review.save_review(db, a, _review())
    # simulate a review saved before scoring existed (or under an older formula)
    db.execute(update(ManualReview).values(suitability_score=None, suitability_band=None, suitability_status=None, suitability_version=None))
    db.commit()
    db.expire_all()
    assert scoring.recompute_stale(db) == 1
    assert (a.review.suitability_score, a.review.suitability_status) == (99, "COMPLETE")
    assert scoring.recompute_stale(db) == 0  # nothing left to do


def test_api_returns_score_after_review_save_and_lead_list_params(db, overpass_payload):
    from fastapi.testclient import TestClient

    from app.database import get_db
    from app.main import app

    a, b, *_ = _businesses(db, overpass_payload)
    app.dependency_overrides[get_db] = lambda: db
    try:
        client = TestClient(app)
        saved = client.put(f"/api/businesses/{a.id}/review", json={"verified_website_status": "SOCIAL_ONLY", "demo_potential": "HIGH"}).json()
        s = saved["review"]["suitability"]
        assert (s["score"], s["status"], s["completeness"], s["band"]) == (36, "PROVISIONAL", 39, "E")
        assert client.put(f"/api/businesses/{a.id}/review", json={"demo_potential": "HUGE"}).status_code == 422
        empty = client.put(f"/api/businesses/{b.id}/review", json={"notes": "just a note"}).json()
        assert empty["review"]["suitability"] is None  # no score until a scoring answer exists

        client.post(f"/api/businesses/{a.id}/approve")
        leads = client.get("/api/leads", params={"sort": "score", "band": "E", "recommendation": "HOLD"}).json()
        assert [l["business"]["id"] for l in leads] == [a.id] and leads[0]["suitability"]["score"] == 36
        assert client.get("/api/leads", params={"band": "Z"}).status_code == 422
        detail = client.get(f"/api/leads/{leads[0]['id']}").json()
        assert len(detail["suitability"]["components"]) == 6 and detail["suitability"]["reasons"][-1] == {"code": "PROVISIONAL", "value": 39}
    finally:
        app.dependency_overrides.clear()
