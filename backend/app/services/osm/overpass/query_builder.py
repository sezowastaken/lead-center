"""Generate Overpass QL for a sector/location combination (spec §15)."""

from app.models import Location, Sector, SectorRule
from app.models.enums import RuleType
from app.services.osm.sector_mapper import POI_KEYS

# Name-only rules are restricted to POI-like objects so streets, bus stops etc. never match.
POI_KEY_FILTER = '[~"^(' + "|".join(POI_KEYS) + ')$"~"."]'
AREA_ID_OFFSET = 3_600_000_000  # Overpass area id = relation id + 3.6e9


class QueryBuildError(ValueError):
    pass


def _q(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _clause(rule: SectorRule) -> str | None:
    if not rule.enabled:
        return None
    match rule.rule_type:
        case RuleType.TAG:
            return f'nwr["{_q(rule.tag_key)}"="{_q(rule.tag_value)}"](area.searchArea);'
        case RuleType.NAME_REGEX:
            return f'nwr["name"~"{_q(rule.regex)}",i]{POI_KEY_FILTER}(area.searchArea);'
        case RuleType.TAG_AND_NAME_REGEX:
            return f'nwr["{_q(rule.tag_key)}"="{_q(rule.tag_value)}"]["name"~"{_q(rule.regex)}",i](area.searchArea);'
        case RuleType.TAG_AND_TAG_REGEX:
            return f'nwr["{_q(rule.tag_key)}"="{_q(rule.tag_value)}"]["{_q(rule.regex_key)}"~"{_q(rule.regex)}",i](area.searchArea);'
    return None


def build_query(sector: Sector, location: Location, timeout_seconds: int = 90) -> str:
    if location.osm_relation_id is None:
        raise QueryBuildError(f"Location '{location.name}' has no osm_relation_id configured")
    clauses = [c for c in (_clause(r) for r in sector.rules) if c]
    if not clauses:
        raise QueryBuildError(f"Sector '{sector.name}' has no enabled discovery rules")
    body = "\n  ".join(clauses)
    return (
        f"[out:json][timeout:{timeout_seconds}];\n"
        f"area(id:{AREA_ID_OFFSET + location.osm_relation_id})->.searchArea;\n"
        f"(\n  {body}\n);\n"
        f"out center tags;"
    )
