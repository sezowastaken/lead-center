"""Provider abstraction (spec §5, §34).

Every discovery source yields `RawOSMElement`s. Everything downstream (sector mapper, normalizer,
dedup, registry) is source-agnostic, so a future PBFProvider only has to implement `OSMSource`.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.models import Location, Sector


@dataclass(frozen=True)
class RawOSMElement:
    osm_type: str  # "node" | "way" | "relation"
    osm_id: int
    lat: float | None
    lon: float | None
    tags: dict[str, str] = field(default_factory=dict)

    @property
    def key(self) -> tuple[str, int]:
        return (self.osm_type, self.osm_id)


@dataclass
class DiscoveryResult:
    elements: list[RawOSMElement]
    query_or_source: str
    from_cache: bool = False


class DiscoveryError(Exception):
    """A provider failed in a way that should be logged on the discovery run."""


class OSMSource(ABC):
    name: str

    @abstractmethod
    def discover(self, sector: Sector, location: Location, *, force_refresh: bool = False) -> DiscoveryResult: ...
