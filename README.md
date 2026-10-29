# Lead Center V2

A local-first tool for finding Istanbul businesses, qualifying them by hand, and tracking manual outreach. Businesses are discovered from OpenStreetMap. Human review is the decision layer.

The source of truth is [`Lead_Center_V2_OSM_Product_and_Technical_Specification.md`](Lead_Center_V2_OSM_Product_and_Technical_Specification.md).

## Status — P0 complete (spec §47 steps 1–17)

Done:
- **Discovery:** Overpass discovery, OSM normalization, deduplication by OSM ID
- **Review:** Discover screen, Review Queue, checklist and notes, Reject / Favorite / Approve
- **Lead List:** approved businesses, with contact data where "verified by me" overrides OSM
- **CRM:** pipeline board; every stage change is kept in history
- **Outreach history:** the exact messages you sent and the replies you received, append-only
- **Dashboard:** today and this-month counts, conversion ratios, sector performance, rejection reasons
- **Backups:** automatic daily SQLite backups (30 kept) plus manual backups
- **Local OSM data:** Geofabrik Turkey extract with download, incremental update and import (step 18), next to Overpass
- **Review sessions:** a persisted, sector-diverse shuffled deck with browser-like Previous / Next, plus a daily target

Not built yet: website crawler, scoring, AI, automatic messaging, cloud.

Lead Center **never sends messages**. Draft the message, copy it, send it yourself, then log it on the lead page.

## Run

Requirements: [uv](https://docs.astral.sh/uv/) and Node.js 20+.

```bat
LeadCenter.bat
```

The launcher:
1. Syncs Python dependencies.
2. Builds the frontend the first time. After updating the code, run `LeadCenter.bat rebuild` so the browser gets the new UI.
3. Stops a Lead Center that is already running (found through `/api/health`). Then it starts FastAPI on `127.0.0.1:8000`, waits for `/api/health` and opens http://localhost:8000.

The page itself is never cached (`index.html` is served with `Cache-Control: no-cache`), so after a rebuild the browser always loads the new version.

Database migrations run automatically on startup.

## Three separate databases

| Use | Database | How |
|---|---|---|
| **Real prospecting** | `data/lead_center.db` | `LeadCenter.bat` (port 8000) |
| **Browser / manual testing** | `data/sandbox/lead_center_sandbox.db` | sandbox profile (port 8001) |
| **Automated tests** | temporary files | `pytest`, `npm test` |

Never test against the real database. The sandbox profile refuses to open `data/lead_center.db`, and the UI shows an amber **Sandbox data** banner whenever you are not on real data.

### Sandbox (development and testing)

```bash
cd backend && uv run python -m app.devtools reset-sandbox --with-sample   # fresh sandbox + Kadıköy beauty sample
cd backend && uv run python -m app.sandbox                                # API on http://127.0.0.1:8001
cd frontend && npm run dev:sandbox                                        # UI on http://localhost:5174 (proxies to :8001)
```

`npm run dev` (port 5173) proxies to the **real** app on :8000. Use it only when you intend to work on real data.

### Starting real prospecting from a clean slate

```bash
cd backend && uv run python -m app.devtools reset-user-data           # dry run: shows exactly what would change
cd backend && uv run python -m app.devtools reset-user-data --yes     # backs up to data/backups/ first, then resets
```

- **`--mode activity`** (the default) forgets every review, rejection, favorite, lead and outreach event, but keeps the discovered OSM businesses. They all return to the review queue.
- **`--mode all`** also removes the discovered businesses and the discovery history. The sector and location library is kept either way.

Close Lead Center before resetting.

### Tests

```bash
cd backend && uv run pytest
cd frontend && npm test
```

## Data

| What | Where |
|---|---|
| Database | `data/lead_center.db` (git-ignored) |
| Overpass response cache (24h TTL) | `data/cache/overpass/` |
| Backups (daily automatic, 30 kept; manual ones never pruned) | `data/backups/` |
| OpenStreetMap extract (`turkey-latest.osm.pbf`, ~650 MB) | `data/osm/` (sandbox: `data/sandbox/osm/`) |
| Sector library (rules, priority, OSM coverage) | `backend/app/seed/sectors.json` |
| Location library (OSM boundary relation IDs) | `backend/app/seed/locations.json` |

Both seed files are synced into the database on every startup. To change sectors, rules or districts, edit the JSON and restart.

**Backups.** A backup is taken when the app starts, before database migrations, if none exists for today (Istanbul date). While the app is running it checks again every hour. Use **Settings → Back up now** for an extra manual backup.

**Restoring a backup.** Close Lead Center, copy the backup file over `data/lead_center.db`, and delete any `lead_center.db-wal` and `lead_center.db-shm` files next to it. Then start the app again.

## OpenStreetMap data (local PBF)

**Settings → OpenStreetMap data** manages the Geofabrik Turkey extract. Nothing is downloaded unless you click a button, and the size is shown before the download starts.

- **Download latest data**
  - Resolves `turkey-latest` to the dated file it points to.
  - Streams it to `turkey-latest.osm.pbf.part`, showing progress, and computes the MD5 as it goes.
  - Checks the byte count, the MD5 against Geofabrik's `.md5` and the PBF header.
  - Only then replaces the working file atomically. A cancel, network error or failed check deletes the `.part` and keeps the previous file.
- **Check for updates** compares the replication sequence in your file with Geofabrik's `turkey-updates/state.txt`. It transfers only a few KB.
- **Update data** runs `pyosmium-up-to-date`, which applies Geofabrik's daily diffs into a temporary file. The result is validated and swapped in. If an incremental update isn't possible, your file stays untouched and you're offered a fresh download.
- **Import / Re-import**
  - Backs up the database first.
  - Pass 1: a C++ key filter plus your sector rules reduce Turkey to a small file of candidate businesses and boundaries.
  - Pass 2: computes coordinates and assigns each business to its district (`locations.json`), otherwise Istanbul. Businesses outside Istanbul are skipped.
  - Existing `osm_type` + `osm_id` records are updated in place. Decisions, reviews, notes, leads and CRM history are never touched. New businesses enter the review queue.

Overpass (Discover → Find businesses) stays available for quick ad-hoc searches.

**Sandbox E2E without the real 650 MB file.** `uv run python -m tests.e2e_extract_server 8765` serves a synthetic Istanbul extract, its `.md5`, `state.txt` and one replication diff. Start the sandbox with `LEAD_CENTER_OSM_PBF_URL=http://127.0.0.1:8765/europe/turkey-latest.osm.pbf` and `LEAD_CENTER_OSM_UPDATES_URL=http://127.0.0.1:8765/europe/turkey-updates`.

## Review sessions

Starting a session takes everything currently waiting for review (with optional sector and location filters) and builds a shuffled deck once:

1. Shuffle within each sector.
2. Interleave the sectors, weighted by how many businesses each has, so the deck mirrors the pool.
3. Two businesses from the same sector only follow each other when the pool makes it unavoidable. In that case the minimum number of repeats is spread evenly through the deck.

The deck and a cursor are stored in `review_sessions`, so the session survives refreshes and restarts:

- **Previous / Next** move through the same deck like browser history, and nothing is reshuffled.
- **Reject / Favorite / Approve** save the decision and move on to the next undecided business.
- **Skip** moves on without a decision.

Opening Review in a new tab offers **Resume** or **Start new shuffled session**. The header shows "N / 30 reviewed today", and the target can be changed in Settings.

## Key rules (from the spec)

- **Missing OSM data means UNKNOWN, not "no".** A business without a `website` tag shows "Website unknown". Only your manual review can record "no independent website". OSM data and "Verified by me" are shown separately.
- **Rejecting never deletes.** A rejected business keeps its OSM identity (`osm_type` + `osm_id`, unique), so re-running discovery never brings it back into the review queue. A mistaken reject or approve can be undone.
- **Re-discovery only refreshes OSM fields.** When a known business is found again, its OSM fields, `last_seen_at` and `times_seen` are updated. Your decisions, sector, location, checklist and notes are never touched.
- **Public Overpass is for prototyping only.** Requests run one at a time, with an identifying User-Agent, a local cache and bounded retries. Regular, high-volume discovery uses the local Geofabrik PBF: `PBFProvider` and the bulk importer in `backend/app/services/osm/pbf/`, behind the same `OSMSource` interface (`backend/app/services/osm/base.py`).

## Attribution

Business discovery data is derived from OpenStreetMap. © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
