"""Idempotent sync of the editable JSON sector/location library into SQLite (spec §13: configurable, not hardcoded)."""

import json
import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Location, Sector, SectorRule
from app.models.enums import LocationType, RuleType

log = logging.getLogger(__name__)
SEED_DIR = Path(__file__).resolve().parent


def _load(name: str) -> dict:
    return json.loads((SEED_DIR / name).read_text(encoding="utf-8"))


def sync_sectors(db: Session, data: dict) -> None:
    for priority_base, item in enumerate(data["sectors"]):
        sector = db.scalar(select(Sector).where(Sector.name == item["name"]))
        if sector is None:
            sector = Sector(name=item["name"])
            db.add(sector)
        sector.commercial_priority = item["commercial_priority"]
        sector.osm_coverage = item["osm_coverage"]
        sector.osm_discovery_enabled = item.get("osm_discovery_enabled", True)
        sector.enabled = item.get("enabled", True)
        sector.notes = item.get("notes")

        # Rules are fully owned by the JSON file: replace them on each sync.
        sector.rules.clear()
        for i, rule in enumerate(item.get("rules", [])):
            rule_type = RuleType(rule["type"])
            sector.rules.append(
                SectorRule(
                    rule_type=rule_type,
                    tag_key=rule.get("tag"),
                    tag_value=rule.get("value"),
                    regex=rule.get("regex"),
                    priority=i,
                    enabled=rule.get("enabled", True),
                )
            )


def sync_locations(db: Session, data: dict) -> None:
    by_name: dict[str, Location] = {}
    for item in data["locations"]:
        loc = db.scalar(select(Location).where(Location.name == item["name"]))
        if loc is None:
            loc = Location(name=item["name"])
            db.add(loc)
        loc.location_type = LocationType(item["location_type"])
        loc.osm_relation_id = item.get("osm_relation_id")
        loc.osm_admin_level = item.get("osm_admin_level")
        loc.enabled = item.get("enabled", True)
        by_name[loc.name] = loc
    db.flush()
    for item in data["locations"]:
        parent = item.get("parent")
        by_name[item["name"]].parent_location_id = by_name[parent].id if parent else None


def sync_seed_data(db: Session) -> None:
    sync_sectors(db, _load("sectors.json"))
    sync_locations(db, _load("locations.json"))
    db.commit()
    log.info("Seed data synced (sectors + locations)")
