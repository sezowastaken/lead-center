from app.models import Location, Sector
from app.services.osm.base import DiscoveryError, DiscoveryResult, OSMSource, RawOSMElement
from app.services.osm.overpass.client import OverpassClient
from app.services.osm.overpass.query_builder import QueryBuildError, build_query


def parse_elements(payload: dict) -> list[RawOSMElement]:
    elements: list[RawOSMElement] = []
    for el in payload.get("elements", []):
        tags = el.get("tags") or {}
        if not tags or el.get("type") not in ("node", "way", "relation"):
            continue
        # Nodes carry lat/lon; ways/relations carry a computed center (out center).
        center = el.get("center") or {}
        lat = el.get("lat", center.get("lat"))
        lon = el.get("lon", center.get("lon"))
        elements.append(RawOSMElement(osm_type=el["type"], osm_id=int(el["id"]), lat=lat, lon=lon, tags=tags))
    return elements


class OverpassProvider(OSMSource):
    name = "OVERPASS"

    def __init__(self, client: OverpassClient) -> None:
        self.client = client

    def discover(self, sector: Sector, location: Location, *, force_refresh: bool = False) -> DiscoveryResult:
        try:
            query = build_query(sector, location, self.client.settings.overpass_timeout_seconds)
        except QueryBuildError as exc:
            raise DiscoveryError(str(exc)) from exc
        payload, from_cache = self.client.run(query, force_refresh=force_refresh)
        return DiscoveryResult(elements=parse_elements(payload), query_or_source=query, from_cache=from_cache)
