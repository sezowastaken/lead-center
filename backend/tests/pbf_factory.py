"""Builds small synthetic OSM PBF files for tests and sandbox E2E runs (no network, no real data)."""

from pathlib import Path

ISTANBUL = 223474
KADIKOY = 1276548

# (lon_min, lat_min, lon_max, lat_max)
ISTANBUL_BOX = (28.5, 40.8, 29.5, 41.3)
KADIKOY_BOX = (29.0, 40.95, 29.1, 41.0)


def _square(nid: int, box) -> list[tuple[int, float, float]]:
    x0, y0, x1, y1 = box
    return [(nid, x0, y0), (nid + 1, x1, y0), (nid + 2, x1, y1), (nid + 3, x0, y1)]


DEFAULT_POIS = [
    # (type, id, lon, lat, tags)
    ("node", 1001, 29.05, 40.97, {"shop": "beauty", "name": "Beauty Cabin Suadiye", "phone": "0216 555 12 34"}),
    ("node", 2001, 28.90, 41.10, {"amenity": "veterinary", "name": "Şişli Veteriner"}),  # Istanbul, no seeded district
    ("node", 3001, 32.80, 39.90, {"shop": "tattoo", "name": "Ankara Tattoo"}),  # outside Istanbul -> skipped
    ("node", 5002, 29.06, 40.96, {"amenity": "clinic", "name": "Lazer Estetik Klinik"}),  # beauty via name regex
    ("node", 5003, 29.07, 40.98, {"highway": "bus_stop", "name": "Beauty Durağı"}),  # not a business
    ("node", 6001, 29.08, 40.97, {"shop": "pet_grooming", "name": "Pati Kuaför"}),  # disabled sector
    ("node", 6002, 29.03, 40.99, {"shop": "tattoo", "name": "Moda Ink"}),
    ("node", 6003, 29.04, 40.96, {"shop": "hairdresser", "name": "Kuaför Ali"}),
]


def write_test_pbf(
    path: Path,
    *,
    pois=DEFAULT_POIS,
    furniture_way: bool = True,
    photo_relation: bool = True,
    replication: tuple[str, int, str] | None = ("2026-10-28T21:21:02Z", 4954, "https://download.geofabrik.de/europe/turkey-updates"),
) -> Path:
    import osmium
    from osmium.osm.mutable import Node, Relation, Way

    header = osmium.io.Header()
    header.set("generator", "lead-center-tests")
    if replication:
        ts, seq, url = replication
        header.set("osmosis_replication_timestamp", ts)
        header.set("osmosis_replication_sequence_number", str(seq))
        header.set("osmosis_replication_base_url", url)

    nodes: list[tuple[int, float, float, dict]] = []
    ways: list[tuple[int, list[int], dict]] = []
    relations: list[tuple[int, list[tuple[str, int, str]], dict]] = []

    def boundary(rel_id: int, way_id: int, first_node: int, box, name: str, level: str) -> None:
        corners = _square(first_node, box)
        nodes.extend((nid, x, y, {}) for nid, x, y in corners)
        ways.append((way_id, [c[0] for c in corners] + [corners[0][0]], {}))
        relations.append((rel_id, [("w", way_id, "outer")], {"type": "boundary", "boundary": "administrative", "admin_level": level, "name": name}))

    boundary(ISTANBUL, 90001, 80001, ISTANBUL_BOX, "İstanbul", "4")
    boundary(KADIKOY, 90002, 80011, KADIKOY_BOX, "Kadıköy", "6")

    for kind, oid, lon, lat, tags in pois:
        assert kind == "node"
        nodes.append((oid, lon, lat, tags))
    if furniture_way:  # a shop mapped as a building outline inside Kadıköy
        corners = _square(81001, (29.02, 40.96, 29.021, 40.961))
        nodes.extend((nid, x, y, {}) for nid, x, y in corners)
        ways.append((4001, [c[0] for c in corners] + [corners[0][0]], {"shop": "furniture", "name": "Kadıköy Mobilya", "building": "yes"}))
    if photo_relation:  # a shop mapped as a multipolygon relation inside Kadıköy
        corners = _square(81011, (29.09, 40.99, 29.091, 40.991))
        nodes.extend((nid, x, y, {}) for nid, x, y in corners)
        ways.append((7101, [c[0] for c in corners] + [corners[0][0]], {}))
        relations.append((7001, [("w", 7101, "outer")], {"type": "multipolygon", "shop": "photo", "name": "Foto Moda"}))

    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    writer = osmium.SimpleWriter(str(path), header=header)
    try:
        for nid, lon, lat, tags in sorted(nodes):
            writer.add_node(Node(id=nid, location=(lon, lat), tags=tags, version=1))
        for wid, refs, tags in sorted(ways):
            writer.add_way(Way(id=wid, nodes=refs, tags=tags, version=1))
        for rid, members, tags in sorted(relations):
            writer.add_relation(Relation(id=rid, members=members, tags=tags, version=1))
    finally:
        writer.close()
    return path
