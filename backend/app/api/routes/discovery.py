from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DiscoveryRun, Location, Sector
from app.schemas.common import DiscoveryRunIn, DiscoveryRunOut
from app.services.discovery import default_provider, run_discovery

router = APIRouter(prefix="/discovery", tags=["discovery"])


@router.post("/runs", response_model=DiscoveryRunOut)
def create_run(body: DiscoveryRunIn, db: Session = Depends(get_db)):
    """Runs synchronously (sync endpoint -> threadpool). Failures are logged on the run's `error` field."""
    sector = db.get(Sector, body.sector_id)
    location = db.get(Location, body.location_id)
    if sector is None or location is None:
        raise HTTPException(status_code=404, detail="Unknown sector or location")
    return run_discovery(db, default_provider(), sector, location, force_refresh=body.force_refresh)


@router.get("/runs", response_model=list[DiscoveryRunOut])
def list_runs(limit: int = 50, db: Session = Depends(get_db)):
    return db.scalars(select(DiscoveryRun).order_by(DiscoveryRun.id.desc()).limit(min(limit, 500))).all()
