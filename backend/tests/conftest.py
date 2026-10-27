import json
import os
import tempfile
from pathlib import Path

# Automated tests must never open the real data/lead_center.db: point the default engine at a
# throwaway file before any app module is imported. Individual tests use their own temp DBs.
os.environ["LEAD_CENTER_PROFILE"] = "sandbox"
os.environ["LEAD_CENTER_DATABASE_PATH"] = str(Path(tempfile.mkdtemp(prefix="lead_center_tests_")) / "unused.db")

import pytest
from sqlalchemy.orm import Session, sessionmaker

from app.database import make_engine
from app.migrate import upgrade_to_head
from app.seed.loader import sync_seed_data

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def db(tmp_path) -> Session:
    url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
    upgrade_to_head(url)  # exercise the real migration, not create_all
    engine = make_engine(url)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    sync_seed_data(session)
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def overpass_payload() -> dict:
    return json.loads((FIXTURES / "overpass_kadikoy_beauty.json").read_text(encoding="utf-8"))
