import os

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db, utcnow

router = APIRouter(tags=["health"])

STARTED_AT = utcnow().isoformat()


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    db.execute(text("SELECT 1"))
    # profile: the UI shows a banner when this is not the real database.
    # pid / started_at: LeadCenter.bat uses them to stop an already-running instance before restarting.
    return {"status": "ok", "profile": get_settings().profile, "pid": os.getpid(), "started_at": STARTED_AT}
