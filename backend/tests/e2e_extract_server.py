"""Local stand-in for download.geofabrik.de, for sandbox E2E runs only (never used by the real app).

    uv run python -m tests.e2e_extract_server [port]

Serves, under /europe/:
  turkey-latest.osm.pbf        -> 302 to a dated file (like Geofabrik)
  turkey-261028.osm.pbf(.md5)  -> a synthetic Istanbul extract with ~60 businesses
  turkey-updates/state.txt     -> one sequence ahead of the extract
  turkey-updates/000/004/955.osc.gz (+ .state.txt) -> a real replication diff adding one tattoo shop

Start the sandbox backend with:
  LEAD_CENTER_OSM_PBF_URL=http://127.0.0.1:<port>/europe/turkey-latest.osm.pbf
  LEAD_CENTER_OSM_UPDATES_URL=http://127.0.0.1:<port>/europe/turkey-updates
"""

import gzip
import hashlib
import http.server
import random
import sys
import tempfile
from pathlib import Path

from tests.pbf_factory import DEFAULT_POIS, KADIKOY_BOX, write_test_pbf

BASE_SEQ = 4954
TS = "2026-10-28T21:21:02Z"
NEXT_TS = "2026-10-29T21:21:02Z"

# Businesses that already exist (with decisions) in the sandbox DB, so the import must leave them alone.
EXISTING = [
    ("node", 9551653317, 29.02621, 40.99408, {"shop": "beauty", "name": "Aziziye Hamami"}),
    ("node", 4464840296, 29.02885, 40.9904, {"shop": "beauty", "name": "Jolly Tours - Beauty Turizm"}),
    ("node", 13075426276, 29.08421, 40.96588, {"shop": "beauty", "name": "Beauty Cabin Suadiye"}),
    ("node", 10910948902, 29.08647, 40.95848, {"shop": "beauty", "name": "Beauty Omelette"}),
]

SECTOR_TAGS = [
    ({"shop": "beauty"}, "Güzellik"),
    ({"shop": "tattoo"}, "Tattoo"),
    ({"amenity": "veterinary"}, "Veteriner"),
    ({"shop": "furniture"}, "Mobilya"),
    ({"shop": "photo"}, "Fotoğraf"),
    ({"shop": "hairdresser"}, "Kuaför"),
    ({"sport": "pilates", "leisure": "fitness_centre"}, "Pilates"),
]


def build_pois() -> list:
    rng = random.Random(7)
    x0, y0, x1, y1 = KADIKOY_BOX
    pois = list(DEFAULT_POIS) + EXISTING
    oid = 900_000
    # Deliberately lopsided like real data: lots of beauty and hairdressers, few photographers.
    weights = [14, 6, 5, 5, 2, 12, 3]
    for (tags, word), n in zip(SECTOR_TAGS, weights, strict=True):
        for i in range(n):
            oid += 1
            pois.append(("node", oid, rng.uniform(x0 + 0.002, x1 - 0.002), rng.uniform(y0 + 0.002, y1 - 0.002), {**tags, "name": f"{word} {i + 1} Moda"}))
    return pois


DIFF = """<?xml version='1.0' encoding='UTF-8'?>
<osmChange version="0.6" generator="lead-center-e2e">
  <create>
    <node id="950001" version="1" timestamp="2026-10-29T12:00:00Z" lat="40.975" lon="29.045">
      <tag k="shop" v="tattoo"/>
      <tag k="name" v="Yeni Dövme Stüdyosu"/>
    </node>
  </create>
</osmChange>
"""


def make_handler(pbf_bytes: bytes):
    md5 = hashlib.md5(pbf_bytes).hexdigest()
    seq = BASE_SEQ + 1
    diff = gzip.compress(DIFF.encode())
    routes = {
        "/europe/turkey-261028.osm.pbf": ("application/octet-stream", pbf_bytes),
        "/europe/turkey-261028.osm.pbf.md5": ("text/plain", f"{md5}  turkey-261028.osm.pbf\n".encode()),
        "/europe/turkey-updates/state.txt": ("text/plain", f"timestamp={NEXT_TS.replace(':', chr(92) + ':')}\nsequenceNumber={seq}\n".encode()),
        f"/europe/turkey-updates/000/004/{seq % 1000:03d}.state.txt": ("text/plain", f"timestamp={NEXT_TS.replace(':', chr(92) + ':')}\nsequenceNumber={seq}\n".encode()),
        f"/europe/turkey-updates/000/004/{BASE_SEQ % 1000:03d}.state.txt": ("text/plain", f"timestamp={TS.replace(':', chr(92) + ':')}\nsequenceNumber={BASE_SEQ}\n".encode()),
        f"/europe/turkey-updates/000/004/{seq % 1000:03d}.osc.gz": ("application/gzip", diff),
    }

    class Handler(http.server.BaseHTTPRequestHandler):
        def _send(self, head_only: bool) -> None:
            if self.path == "/europe/turkey-latest.osm.pbf":
                self.send_response(302)
                self.send_header("Location", "/europe/turkey-261028.osm.pbf")
                self.end_headers()
                return
            if self.path not in routes:
                self.send_response(404)
                self.end_headers()
                return
            ctype, body = routes[self.path]
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Last-Modified", "Thu, 29 Oct 2026 02:48:24 GMT")
            self.end_headers()
            if not head_only:
                self.wfile.write(body)

        def do_HEAD(self):  # noqa: N802
            self._send(True)

        def do_GET(self):  # noqa: N802
            self._send(False)

        def log_message(self, fmt, *args):
            sys.stderr.write("e2e-extract: " + fmt % args + "\n")

    return Handler


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    root = Path(tempfile.mkdtemp(prefix="lc_e2e_extract_"))
    # The replication URL in the header must point at this server so pyosmium-up-to-date uses it.
    pbf = write_test_pbf(root / "turkey.osm.pbf", pois=build_pois(), replication=(TS, BASE_SEQ, f"http://127.0.0.1:{port}/europe/turkey-updates"))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), make_handler(pbf.read_bytes()))
    print(f"serving synthetic Turkey extract ({pbf.stat().st_size} bytes) on http://127.0.0.1:{port}/europe/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
