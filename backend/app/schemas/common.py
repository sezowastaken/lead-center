from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SectorRuleOut(ORMModel):
    id: int
    rule_type: str
    tag_key: str | None
    tag_value: str | None
    regex_key: str | None = None
    regex: str | None
    enabled: bool


class SectorOut(ORMModel):
    id: int
    name: str
    commercial_priority: str
    osm_coverage: str
    osm_discovery_enabled: bool
    enabled: bool
    notes: str | None
    match_priority: int = 100
    review_weight: float | None = None
    rules: list[SectorRuleOut] = []


class SectorBrief(ORMModel):
    id: int
    name: str
    commercial_priority: str
    osm_coverage: str


class LocationOut(ORMModel):
    id: int
    name: str
    parent_location_id: int | None
    location_type: str
    osm_relation_id: int | None
    enabled: bool


class LocationBrief(ORMModel):
    id: int
    name: str


class DiscoveryRunIn(BaseModel):
    sector_id: int
    location_id: int
    force_refresh: bool = False


class DiscoveryRunOut(ORMModel):
    id: int
    provider: str
    sector: SectorBrief | None
    location: LocationBrief | None
    query_or_source: str | None
    from_cache: bool
    started_at: datetime
    completed_at: datetime | None
    result_count: int
    new_count: int
    known_count: int
    error: str | None
