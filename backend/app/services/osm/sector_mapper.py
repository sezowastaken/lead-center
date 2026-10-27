"""Sector rule matching (spec §13). Shared by every provider and by the Overpass query builder."""

import re

from app.models import Sector, SectorRule
from app.models.enums import RuleType


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
            return _name_matches(rule.regex or "", tags.get("name"))
        case RuleType.TAG_AND_NAME_REGEX:
            return tags.get(rule.tag_key or "") == rule.tag_value and _name_matches(rule.regex or "", tags.get("name"))
    return False


def matching_rule(sector: Sector, tags: dict[str, str]) -> SectorRule | None:
    for rule in sector.rules:
        if rule_matches(rule, tags):
            return rule
    return None
