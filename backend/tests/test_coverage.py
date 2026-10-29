from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import get_db
from app.main import app
from app.models import OSMBusiness
from app.models.enums import RejectReason
from app.services.osm.pbf.importer import import_pbf
from app.services.review import service as review
from tests.pbf_factory import write_test_pbf


def _setup(db, tmp_path):
    import_pbf(db, write_test_pbf(tmp_path / "osm" / "turkey-latest.osm.pbf"))  # 7 businesses (1 at city level)
    tattoo = db.scalar(select(OSMBusiness).where(OSMBusiness.osm_id == 6002))
    review.reject(db, tattoo, RejectReason.OTHER, None)
    review.approve(db, db.scalar(select(OSMBusiness).where(OSMBusiness.osm_id == 1001)))
    # A business with neither sector nor location (e.g. an old record) must still be counted explicitly.
    db.add(OSMBusiness(osm_type="node", osm_id=99, name="Orphan", raw_tags_json="{}"))
    db.commit()


def _client(db):
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_coverage_totals_distributions_and_matrix(db, tmp_path):
    _setup(db, tmp_path)
    try:
        c = _client(db)
        waiting = c.get("/api/coverage").json()
        assert waiting["totals"] == {"total": 8, "waiting": 6, "decided": 2, "approved": 1, "rejected": 1}
        assert waiting["population_total"] == 6 and waiting["browse_state"] == "queue"
        sectors = {r["name"]: r for r in waiting["sectors"]}
        assert sectors["Unassigned"]["count"] == 1 and sectors["Unassigned"]["id"] is None
        assert sectors["Beauty / Aesthetics"]["count"] == 1  # the approved beauty business is not waiting
        assert sectors["Beauty / Aesthetics"]["review_weight"] == 2.0
        assert sectors["Burger"]["count"] == 0  # searchable sectors stay visible as coverage gaps
        assert round(sum(r["pct"] for r in waiting["sectors"])) == 100
        locations = {r["name"]: r for r in waiting["locations"]}
        assert locations["Istanbul (no district)"]["count"] == 1
        assert locations["Kadıköy"]["count"] == 4 and locations["Unassigned"]["count"] == 1
        assert sum(cell["count"] for cell in waiting["cells"]) == 6

        everything = c.get("/api/coverage", params={"population": "all"}).json()
        assert everything["population_total"] == 8 and everything["browse_state"] == "all"
        rejected = c.get("/api/coverage", params={"population": "rejected"}).json()
        assert [(r["name"], r["count"]) for r in rejected["sectors"] if r["count"]] == [("Tattoo", 1)]
        assert c.get("/api/coverage", params={"population": "nope"}).status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_browse_links_match_coverage_counts(db, tmp_path):
    """Every Coverage number must equal what Browse shows for the same filters (the click-through)."""
    _setup(db, tmp_path)
    try:
        c = _client(db)
        for population in ("waiting", "all", "decided", "approved", "rejected"):
            cov = c.get("/api/coverage", params={"population": population}).json()
            state = cov["browse_state"]
            for cell in cov["cells"]:
                params = {"state": state, "sector_id": cell["sector_id"] or "none", "location_id": cell["location_id"] or "none"}
                assert c.get("/api/businesses", params=params).json()["total"] == cell["count"], (population, cell)
            for row in cov["sectors"]:
                assert c.get("/api/businesses", params={"state": state, "sector_id": row["id"] or "none"}).json()["total"] == row["count"]
            for row in cov["locations"]:
                assert c.get("/api/businesses", params={"state": state, "location_id": row["id"] or "none"}).json()["total"] == row["count"]
        assert c.get("/api/businesses", params={"sector_id": "abc"}).status_code == 422
    finally:
        app.dependency_overrides.clear()
