from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.backup import service as backups
from app.services.dashboard import build_dashboard

router = APIRouter(tags=["system"])


class BackupOut(BaseModel):
    name: str
    created_at: datetime
    size_bytes: int
    manual: bool


def _out(b: backups.BackupInfo) -> BackupOut:
    return BackupOut(name=b.name, created_at=b.created_at, size_bytes=b.size_bytes, manual=b.manual)


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)) -> dict:
    return build_dashboard(db)


@router.get("/backups", response_model=list[BackupOut])
def get_backups():
    return [_out(b) for b in backups.list_backups()]


@router.post("/backups", response_model=BackupOut)
def post_backup():
    return _out(backups.create_backup(manual=True))
