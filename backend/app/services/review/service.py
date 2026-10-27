"""Review decisions (spec §19, §27). Nothing is ever physically deleted."""

from sqlalchemy.orm import Session

from app.database import utcnow
from app.models import LeadRecord, ManualReview, OSMBusiness, ReviewReachability, WebsiteIssue
from app.models.enums import CrmStage, RecordState, RejectReason
from app.schemas.business import ReviewIn

_SCALAR_REVIEW_FIELDS = [k for k in ReviewIn.model_fields if k not in ("website_issues", "reachability")]


def save_review(db: Session, business: OSMBusiness, data: ReviewIn) -> ManualReview:
    review = business.review
    if review is None:
        review = ManualReview(business_id=business.id, reviewed_at=utcnow())
        db.add(review)
        business.review = review

    for field in _SCALAR_REVIEW_FIELDS:
        value = getattr(data, field)
        if isinstance(value, str):
            value = value.strip() or None
        setattr(review, field, value)
    # Clear + flush first so re-adding the same code doesn't hit the unique constraint before the delete.
    review.website_issues.clear()
    review.reachability.clear()
    db.flush()
    review.website_issues.extend(WebsiteIssue(issue_code=c) for c in dict.fromkeys(data.website_issues))
    review.reachability.extend(ReviewReachability(channel=c) for c in dict.fromkeys(data.reachability))
    review.updated_at = utcnow()

    if business.record_state == RecordState.DISCOVERED:
        business.record_state = RecordState.IN_REVIEW
    db.commit()
    db.refresh(business)
    return review


def reject(db: Session, business: OSMBusiness, reason: RejectReason, note: str | None) -> None:
    business.record_state = RecordState.REJECTED
    business.reject_reason = reason
    business.reject_note = (note or "").strip() or None
    business.decided_at = utcnow()
    db.commit()


def set_favorite(db: Session, business: OSMBusiness, favorite: bool) -> None:
    business.favorite = favorite
    if favorite and business.record_state in (RecordState.DISCOVERED, RecordState.IN_REVIEW):
        business.record_state = RecordState.FAVORITED
        business.decided_at = utcnow()
    elif not favorite and business.record_state == RecordState.FAVORITED:
        business.record_state = RecordState.IN_REVIEW
    db.commit()


def approve(db: Session, business: OSMBusiness) -> LeadRecord:
    business.record_state = RecordState.APPROVED
    business.decided_at = utcnow()
    business.reject_reason = None
    business.reject_note = None
    if business.lead_record is None:
        business.lead_record = LeadRecord(business_id=business.id, stage=CrmStage.READY_TO_CONTACT)
    db.commit()
    return business.lead_record


def restore(db: Session, business: OSMBusiness) -> None:
    """Undo a reject/approve decision. An existing lead record is kept (history is never deleted)."""
    business.record_state = RecordState.FAVORITED if business.favorite else RecordState.IN_REVIEW
    business.reject_reason = None
    business.reject_note = None
    business.decided_at = utcnow()
    db.commit()
