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

Not built yet: PBF importer and `PBFProvider` (step 18 / P1), website crawler, scoring, AI, automatic messaging, cloud.

Lead Center **never sends messages**. Draft the message, copy it, send it yourself, then log it on the lead page.

## Run

Requirements: [uv](https://docs.astral.sh/uv/) and Node.js 20+.

```bat
LeadCenter.bat
```

The launcher:
1. Syncs Python dependencies.
2. Builds the frontend the first time. After updating the code, run `LeadCenter.bat rebuild` so the browser gets the new UI.
3. Starts FastAPI on `127.0.0.1:8000`, waits for `/api/health`, then opens http://localhost:8000.

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
| Sector library (rules, priority, OSM coverage) | `backend/app/seed/sectors.json` |
| Location library (OSM boundary relation IDs) | `backend/app/seed/locations.json` |

Both seed files are synced into the database on every startup. To change sectors, rules or districts, edit the JSON and restart.

**Backups.** A backup is taken when the app starts, before database migrations, if none exists for today (Istanbul date). While the app is running it checks again every hour. Use **Settings → Back up now** for an extra manual backup.

**Restoring a backup.** Close Lead Center, copy the backup file over `data/lead_center.db`, and delete any `lead_center.db-wal` and `lead_center.db-shm` files next to it. Then start the app again.

## Key rules (from the spec)

- **Missing OSM data means UNKNOWN, not "no".** A business without a `website` tag shows "Website unknown". Only your manual review can record "no independent website". OSM data and "Verified by me" are shown separately.
- **Rejecting never deletes.** A rejected business keeps its OSM identity (`osm_type` + `osm_id`, unique), so re-running discovery never brings it back into the review queue. A mistaken reject or approve can be undone.
- **Re-discovery only refreshes OSM fields.** When a known business is found again, its OSM fields, `last_seen_at` and `times_seen` are updated. Your decisions, sector, location, checklist and notes are never touched.
- **Public Overpass is for prototyping only.** Requests run one at a time, with an identifying User-Agent, a local cache and bounded retries. Long-term discovery will use a local Geofabrik PBF through a `PBFProvider`, which plugs into the `OSMSource` interface in `backend/app/services/osm/base.py`. It is not implemented yet.

## Attribution

Business discovery data is derived from OpenStreetMap. © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
