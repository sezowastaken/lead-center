from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Location, Sector
from app.schemas.common import LocationOut, SectorOut

router = APIRouter(tags=["configuration"])


@router.get("/sectors", response_model=list[SectorOut])
def list_sectors(db: Session = Depends(get_db)):
    return db.scalars(select(Sector).order_by(Sector.id)).all()


class WeightIn(BaseModel):
    review_weight: float = Field(ge=0.1, le=5.0)


@router.put("/sectors/{sector_id}/review-weight", response_model=SectorOut)
def set_review_weight(sector_id: int, body: WeightIn, db: Session = Depends(get_db)):
    """How often this sector comes up in NEW review sessions. Existing sessions keep their stored deck."""
    sector = db.get(Sector, sector_id)
    if sector is None:
        raise HTTPException(status_code=404, detail="Sector not found")
    sector.review_weight = round(body.review_weight, 2)
    db.commit()
    return sector


@router.get("/locations", response_model=list[LocationOut])
def list_locations(db: Session = Depends(get_db)):
    return db.scalars(select(Location).order_by(Location.id)).all()
