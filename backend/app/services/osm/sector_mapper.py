"""Sector rule matching (spec §13). Shared by every provider and by the Overpass query builder."""

import re

from app.models import Sector, SectorRule
from app.models.enums import RuleType

# Name-only rules apply to POI-like objects only (same restriction as the Overpass query builder),
# so streets or bus stops named "... Beauty ..." never match.
POI_KEYS = ("shop", "amenity", "craft", "office", "healthcare", "leisure", "beauty")


def _name_matches(regex: str, name: str | None) -> bool:
    if not name:
        return False
    # Normalise Turkish dotted capital I so "GÜZELLİK" matches "güzellik".
    text = name.replace("İ", "i").lower()
    return re.search(regex, text, flags=re.IGNORECASE) is not None


def rule_matches(rule: SectorRule, tags: dict[str, str]) -> bool:
    if not rule.enabled:
        return False
    match rule.rule_type:
        case RuleType.TAG:
            return tags.get(rule.tag_key or "") == rule.tag_value
        case RuleType.NAME_REGEX:
            return any(k in tags for k in POI_KEYS) and _name_matches(rule.regex or "", tags.get("name"))
        case RuleType.TAG_AND_NAME_REGEX:
            return tags.get(rule.tag_key or "") == rule.tag_value and _name_matches(rule.regex or "", tags.get("name"))
        case RuleType.TAG_AND_TAG_REGEX:
            # e.g. amenity=fast_food and cuisine~burger ("burger;american" matches)
            return tags.get(rule.tag_key or "") == rule.tag_value and _name_matches(rule.regex or "", tags.get(rule.regex_key or ""))
    return False


def match_order(sectors):
    """Order in which sectors are tried when one object could fit several (spec: Burger before Fast Food)."""
    return sorted(sectors, key=lambda s: (s.match_priority if s.match_priority is not None else 100, s.id))


def matching_rule(sector: Sector, tags: dict[str, str]) -> SectorRule | None:
    for rule in sector.rules:
        if rule_matches(rule, tags):
            return rule
    return None
