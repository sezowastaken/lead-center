from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LeadRecord
from app.schemas.crm import LeadDetail, LeadOut, LeadUpdate, OutreachEventIn, StageChangeIn
from app.services.crm import service as crm

router = APIRouter(prefix="/leads", tags=["leads"])


def _get(db: Session, lead_id: int) -> LeadRecord:
    lead = db.get(LeadRecord, lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.get("", response_model=list[LeadOut])
def get_leads(stage: str | None = None, sector_id: int | None = None, q: str | None = None, db: Session = Depends(get_db)):
    return [LeadOut.from_lead(lead) for lead in crm.list_leads(db, stage=stage, sector_id=sector_id, q=q)]


@router.get("/{lead_id}", response_model=LeadDetail)
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    return LeadDetail.from_lead(_get(db, lead_id))


@router.put("/{lead_id}", response_model=LeadDetail)
def put_lead(lead_id: int, body: LeadUpdate, db: Session = Depends(get_db)):
    lead = _get(db, lead_id)
    crm.update_lead(db, lead, body)
    return LeadDetail.from_lead(lead)


@router.post("/{lead_id}/stage", response_model=LeadDetail)
def post_stage(lead_id: int, body: StageChangeIn, db: Session = Depends(get_db)):
    lead = _get(db, lead_id)
    crm.change_stage(db, lead, body.stage, body.note)
    return LeadDetail.from_lead(lead)


@router.post("/{lead_id}/events", response_model=LeadDetail)
def post_event(lead_id: int, body: OutreachEventIn, db: Session = Depends(get_db)):
    lead = _get(db, lead_id)
    crm.add_event(db, lead, body)
    return LeadDetail.from_lead(lead)
