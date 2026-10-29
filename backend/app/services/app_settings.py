"""Tiny JSON key/value store on the app_settings table."""

import json
from typing import Any

from sqlalchemy.orm import Session

from app.database import utcnow
from app.models import AppSetting


def get_json(db: Session, key: str, default: Any = None) -> Any:
    row = db.get(AppSetting, key)
    if row is None or row.value is None:
        return default
    try:
        return json.loads(row.value)
    except ValueError:
        return default


def set_json(db: Session, key: str, value: Any, *, commit: bool = True) -> None:
    row = db.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key)
        db.add(row)
    row.value = json.dumps(value, ensure_ascii=False, default=str)
    row.updated_at = utcnow()
    if commit:
        db.commit()
