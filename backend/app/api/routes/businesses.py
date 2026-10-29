from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import OSMBusiness
from app.models.enums import RecordState
from app.repositories.businesses import NONE, STATE_VIEWS, BusinessFilters, list_businesses, next_in_queue
from app.schemas.business import BusinessDetail, BusinessPage, BusinessOut, FavoriteIn, QueueNext, RejectIn, ReviewIn
from app.services.review import service as review_service

router = APIRouter(tags=["businesses"])


def _id_or_none(name: str, value: str | None) -> int | str | None:
    if value is None or value == "":
        return None
    if value == NONE:
        return NONE
    if value.isdigit():
        return int(value)
    raise HTTPException(status_code=422, detail=f"{name} must be a number or '{NONE}'")


def filters_dep(
    state: str | None = "queue",
    sector_id: str | None = None,
    location_id: str | None = None,
    website_type: str | None = None,
    has_phone: bool | None = None,
    has_website: bool | None = None,
    favorite: bool | None = None,
    discovered_since: date | None = None,
    commercial_priority: str | None = None,
    osm_coverage: str | None = None,
    q: str | None = None,
) -> BusinessFilters:
    if state and state != "all" and state not in STATE_VIEWS and state not in RecordState.__members__:
        raise HTTPException(status_code=422, detail=f"Unknown state filter '{state}'")
    return BusinessFilters(
        state=state,
        sector_id=_id_or_none("sector_id", sector_id),
        location_id=_id_or_none("location_id", location_id),
        website_type=website_type,
        has_phone=has_phone, has_website=has_website, favorite=favorite, discovered_since=discovered_since,
        commercial_priority=commercial_priority, osm_coverage=osm_coverage, q=q,
    )


def _get(db: Session, business_id: int) -> OSMBusiness:
    business = db.get(OSMBusiness, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


@router.get("/businesses", response_model=BusinessPage)
def get_businesses(
    filters: Annotated[BusinessFilters, Depends(filters_dep)],
    sort: str = "newest",
    limit: Annotated[int, Query(ge=1, le=500)] = 60,
    offset: Annotated[int, Query(ge=0)] = 0,
    db: Session = Depends(get_db),
):
    items, total = list_businesses(db, filters, sort=sort, limit=limit, offset=offset)
    return BusinessPage(items=[BusinessOut.from_business(b) for b in items], total=total, limit=limit, offset=offset)


@router.get("/review-queue/next", response_model=QueueNext)
def get_next_in_queue(
    filters: Annotated[BusinessFilters, Depends(filters_dep)],
    after_id: int | None = None,
    db: Session = Depends(get_db),
):
    business, remaining = next_in_queue(db, filters, after_id)
    return QueueNext(business=BusinessDetail.from_business(business) if business else None, remaining=remaining)


@router.get("/businesses/{business_id}", response_model=BusinessDetail)
def get_business(business_id: int, db: Session = Depends(get_db)):
    return BusinessDetail.from_business(_get(db, business_id))


@router.put("/businesses/{business_id}/review", response_model=BusinessDetail)
def put_review(business_id: int, body: ReviewIn, db: Session = Depends(get_db)):
    business = _get(db, business_id)
    review_service.save_review(db, business, body)
    return BusinessDetail.from_business(business)


@router.post("/businesses/{business_id}/reject", response_model=BusinessDetail)
def reject_business(business_id: int, body: RejectIn, db: Session = Depends(get_db)):
    business = _get(db, business_id)
    review_service.reject(db, business, body.reason, body.note)
    return BusinessDetail.from_business(business)


@router.post("/businesses/{business_id}/favorite", response_model=BusinessDetail)
def favorite_business(business_id: int, body: FavoriteIn, db: Session = Depends(get_db)):
    business = _get(db, business_id)
    review_service.set_favorite(db, business, body.favorite)
    return BusinessDetail.from_business(business)


@router.post("/businesses/{business_id}/approve", response_model=BusinessDetail)
def approve_business(business_id: int, db: Session = Depends(get_db)):
    business = _get(db, business_id)
    review_service.approve(db, business)
    return BusinessDetail.from_business(business)


@router.post("/businesses/{business_id}/restore", response_model=BusinessDetail)
def restore_business(business_id: int, db: Session = Depends(get_db)):
    business = _get(db, business_id)
    review_service.restore(db, business)
    return BusinessDetail.from_business(business)
