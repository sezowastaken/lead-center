from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Location, Sector
from app.schemas.common import LocationOut, SectorOut

router = APIRouter(tags=["configuration"])


@router.get("/sectors", response_model=list[SectorOut])
def list_sectors(db: Session = Depends(get_db)):
    return db.scalars(select(Sector).order_by(Sector.id)).all()


@router.get("/locations", response_model=list[LocationOut])
def list_locations(db: Session = Depends(get_db)):
    return db.scalars(select(Location).order_by(Location.id)).all()
