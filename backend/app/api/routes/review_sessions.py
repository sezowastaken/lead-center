from collections import Counter
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import OSMBusiness, ReviewSession, Sector
from app.schemas.business import BusinessDetail
from app.services.app_settings import get_json, set_json
from app.services.dashboard import reviewed_since
from app.services.review import sessions
from app.timeutil import today_start_utc

router = APIRouter(tags=["review"])

DEFAULT_DAILY_TARGET = 30


class SessionIn(BaseModel):
    sector_id: int | None = None
    location_id: int | None = None


class MoveIn(BaseModel):
    action: Literal["previous", "next", "advance"]


class TargetIn(BaseModel):
    target: int = Field(ge=1, le=500)


def _out(db: Session, session: ReviewSession) -> dict:
    data = sessions.summary(db, session)
    bid = data["current_business_id"]
    business = db.get(OSMBusiness, bid) if bid else None
    data["business"] = BusinessDetail.from_business(business) if business else None
    return data


def _get(db: Session, session_id: int) -> ReviewSession:
    session = db.get(ReviewSession, session_id)
    if session is None or session.status == sessions.CLOSED:
        raise HTTPException(status_code=404, detail="Review session not found or already closed")
    return session


@router.get("/review-sessions/current")
def current(db: Session = Depends(get_db)) -> dict:
    session = sessions.active_session(db)
    return {"session": _out(db, session) if session else None}


@router.get("/review-sessions/eligible")
def eligible(sector_id: int | None = None, location_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    items = sessions.eligible(db, {"sector_id": sector_id, "location_id": location_id})
    names = {s.id: s.name for s in db.query(Sector)}
    by_sector = Counter(names.get(sid, "No sector") for _, sid in items)
    return {"count": len(items), "by_sector": [{"sector": k, "count": v} for k, v in by_sector.most_common()]}


@router.post("/review-sessions")
def start(body: SessionIn, db: Session = Depends(get_db)) -> dict:
    return _out(db, sessions.create_session(db, body.model_dump()))


@router.post("/review-sessions/{session_id}/move")
def move(session_id: int, body: MoveIn, db: Session = Depends(get_db)) -> dict:
    return _out(db, sessions.move(db, _get(db, session_id), body.action))


@router.post("/review-sessions/{session_id}/close")
def close(session_id: int, db: Session = Depends(get_db)) -> dict:
    session = _get(db, session_id)
    session.status = sessions.CLOSED
    db.commit()
    return {"session": None}


@router.get("/review/progress")
def progress(db: Session = Depends(get_db)) -> dict:
    return {"reviewed_today": reviewed_since(db, today_start_utc()), "target": get_json(db, "review.daily_target", DEFAULT_DAILY_TARGET)}


@router.put("/review/daily-target")
def set_target(body: TargetIn, db: Session = Depends(get_db)) -> dict:
    set_json(db, "review.daily_target", body.target)
    return progress(db)
