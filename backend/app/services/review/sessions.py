"""Persistent review sessions: a stored deck plus a cursor that moves like browser history."""

import json
import random

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import utcnow
from app.models import OSMBusiness, ReviewSession, Sector
from app.models.enums import REVIEW_QUEUE_STATES
from app.repositories.businesses import BusinessFilters, apply_filters
from app.services.review.deck import build_deck

SESSION_FILTER_KEYS = ("sector_id", "location_id")
ACTIVE, COMPLETED, CLOSED = "ACTIVE", "COMPLETED", "CLOSED"


def _filters(raw: dict) -> BusinessFilters:
    f = BusinessFilters(state="queue")
    for key in SESSION_FILTER_KEYS:
        if raw.get(key) is not None:
            setattr(f, key, int(raw[key]))
    return f


def eligible(db: Session, filters: dict) -> list[tuple[int, int | None]]:
    """Businesses currently waiting for review (DISCOVERED / IN_REVIEW) matching the filters."""
    stmt = apply_filters(select(OSMBusiness.id, OSMBusiness.sector_id), _filters(filters)).order_by(OSMBusiness.id)
    return [(row.id, row.sector_id) for row in db.execute(stmt)]


def deck_of(session: ReviewSession) -> list[int]:
    return json.loads(session.deck_json)


def active_session(db: Session) -> ReviewSession | None:
    return db.scalar(select(ReviewSession).where(ReviewSession.status.in_((ACTIVE, COMPLETED))).order_by(ReviewSession.id.desc()))


def create_session(db: Session, filters: dict, seed: int | None = None) -> ReviewSession:
    """Close any open session and build a new shuffled deck from what is eligible right now."""
    for old in db.scalars(select(ReviewSession).where(ReviewSession.status.in_((ACTIVE, COMPLETED)))):
        old.status = CLOSED
    clean = {k: filters[k] for k in SESSION_FILTER_KEYS if filters.get(k) is not None}
    seed = seed if seed is not None else random.SystemRandom().randrange(1, 2**31)
    # Weights are read now and baked into the stored deck: later weight changes only affect new sessions.
    weights = {s.id: s.review_weight for s in db.scalars(select(Sector))}
    deck = build_deck(eligible(db, clean), seed, weights)
    session = ReviewSession(status=ACTIVE if deck else COMPLETED, filters_json=json.dumps(clean), seed=seed, deck_json=json.dumps(deck), cursor=0)
    db.add(session)
    db.commit()
    return session


def _states(db: Session, ids: list[int]) -> dict[int, str]:
    out: dict[int, str] = {}
    for i in range(0, len(ids), 900):
        chunk = ids[i : i + 900]
        out.update(db.execute(select(OSMBusiness.id, OSMBusiness.record_state).where(OSMBusiness.id.in_(chunk))).all())
    return out


def move(db: Session, session: ReviewSession, action: str) -> ReviewSession:
    """previous / next: one step through the fixed deck (history). advance: to the next still-undecided item."""
    deck = deck_of(session)
    n = len(deck)
    cursor = session.cursor
    if action == "previous":
        cursor = max(0, cursor - 1)
    elif action == "next":
        cursor = min(n, cursor + 1)
    elif action == "advance":
        states = _states(db, deck[cursor + 1 :])
        cursor = next((i for i in range(cursor + 1, n) if states.get(deck[i]) in REVIEW_QUEUE_STATES), n)
    else:
        raise ValueError(f"Unknown action {action!r}")
    session.cursor = cursor
    session.status = COMPLETED if cursor >= n else ACTIVE
    session.updated_at = utcnow()
    db.commit()
    return session


def summary(db: Session, session: ReviewSession) -> dict:
    deck = deck_of(session)
    states = _states(db, deck)
    pending = sum(1 for bid in deck if states.get(bid) in REVIEW_QUEUE_STATES)
    current_id = deck[session.cursor] if session.cursor < len(deck) else None
    return {
        "id": session.id,
        "status": session.status,
        "created_at": session.created_at,
        "filters": json.loads(session.filters_json),
        "total": len(deck),
        "cursor": session.cursor,
        "position": min(session.cursor + 1, len(deck)),
        "decided": len(deck) - pending,
        "pending": pending,
        "current_business_id": current_id,
        "at_start": session.cursor == 0,
        "at_end": session.cursor >= len(deck),
    }
