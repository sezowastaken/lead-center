# Lead Center V2 — OSM / Local-First Architecture
## Product, Data, UX and Technical Specification

**Status:** Finalized prototype architecture  
**Supersedes:** Lead Center V1 (Google Places architecture)  
**Primary user:** Single local user  
**Target platform:** Windows desktop, browser UI on localhost  
**Primary objective:** Discover large numbers of potentially valuable Istanbul businesses, manually qualify them, organize outreach, and track results with zero recurring infrastructure/API cost.

---

# 1. Executive Summary

Lead Center is a local-first business discovery, qualification, outreach, and lightweight CRM application.

Its purpose is not to automate sales end-to-end. It exists to make one repeatable workflow fast enough to use every day:

```text
DISCOVER
  ->
NORMALIZE
  ->
DEDUPLICATE
  ->
REVIEW
  ->
DECIDE
  ->
CONTACT
  ->
TRACK
  ->
LEARN
```

The application should help the user:

1. Discover hundreds or thousands of local businesses.
2. Avoid repeatedly reviewing the same business.
3. Browse businesses in a fast “market” interface.
4. Manually research promising businesses with Google Search, Google Maps, websites, Instagram, WhatsApp, and external AI tools.
5. Record a structured checklist for each business.
6. Reject businesses permanently from the normal review flow.
7. Favorite uncertain/interesting businesses.
8. Approve strong prospects into a persistent Lead List.
9. Track outreach, replies, meetings, offers, wins, and losses.
10. Measure which sectors actually convert over time.

The V2 architecture deliberately removes Google Cloud / Google Places API from the application.

The application will use:

- **OpenStreetMap data** for discovery.
- **Overpass API** only for prototyping, small tests, and lightweight ad-hoc discovery.
- **Geofabrik Turkey `.osm.pbf` extract** as the preferred long-term local discovery source.
- **SQLite** as the permanent local database.
- **React + TypeScript + Vite** for the UI.
- **FastAPI + Python** for the backend.
- **No cloud server.**
- **No paid hosting.**
- **No custom domain.**
- **No Google billing account.**
- **No AI API.**
- **No automatic WhatsApp / Instagram messaging.**

The key architectural idea is:

> OSM provides raw discovery candidates; Lead Center stores and manages the user’s own qualification and sales workflow.

---

# 2. Why V2 Uses OSM Instead of Google Places

The original architecture used Google Places because of its data quality.

However, Google Cloud introduced unnecessary friction for this prototype:

- billing account activation
- possible prepayment requirements
- quota management
- risk of accidental paid usage
- restrictions around caching/storing Google Places content

The project’s current priority is not maximum data completeness.

The priority is:

> Build a zero-cost system that can repeatedly place enough real Istanbul businesses in front of the user to sustain daily prospecting.

OSM has already been tested manually and produced a meaningful number of real businesses.

Benchmark test in Kadıköy:

```text
Sector                     Total    Named    Website tag    Phone tag

Beauty / Aesthetics          43       42          14             11
Hairdresser / Barber        167      155          16             16
Veterinary                   56       50          18             13
Auto Care / Detailing        12        4           2              0
Tattoo                       23       23           3              2
Photography                  16       13           2              1
Interior Design               0        0           0              0
Furniture / Custom           49       45          10              0
Pet Grooming                  2        2           0              1
Pilates                      11       11           4              1
```

The results show two things:

1. OSM is strong enough to provide useful discovery volume in multiple sectors.
2. OSM coverage varies significantly by sector.

Therefore the system must treat OSM as a **candidate discovery engine**, not as a complete representation of the local business market.

---

# 3. Product Philosophy

## 3.1 Human-in-the-loop

The application does not make final sales decisions.

The user may use:

- Google Maps
- Google Search
- business website
- Instagram
- WhatsApp
- external AI assistants such as ChatGPT or Claude

during manual research.

Lead Center records the result of that research.

## 3.2 OSM missing data is “unknown”, not “no”

This rule is mandatory.

If an OSM object has no `website` tag:

```text
WRONG:
Website = No

CORRECT:
OSM website data = Unknown / not recorded
```

The user may later manually verify:

```text
Verified website status = NO WEBSITE
```

The same applies to phone, email, opening hours, social media, and business activity.

OSM absence must never be interpreted as proof that something does not exist.

## 3.3 User decisions are more important than automatic scores

The system may compute ranking scores, but:

- score does not automatically reject
- score does not permanently hide
- user decision always overrides score

## 3.4 Rejection is not deletion

A rejected business remains in the permanent registry.

Reason:

If it appears again in a future OSM import/query, it must not return to the normal review queue.

UI:

```text
Reject
```

Backend:

```text
record_state = REJECTED
```

---

# 4. OSM Licensing and Attribution

OpenStreetMap data is licensed under the Open Data Commons Open Database License (ODbL).

The application may copy, store, process, and adapt OSM data, provided required attribution and license obligations are respected.

V2 must include a visible attribution such as:

```text
© OpenStreetMap contributors
```

where OSM-derived data is presented.

Recommended Settings/About text:

```text
Business discovery data is derived from OpenStreetMap.
© OpenStreetMap contributors
ODbL
```

If the application later distributes a derived database outside personal use, ODbL share-alike obligations must be reviewed carefully.

For this local personal workflow, the application should still preserve attribution from the beginning.

---

# 5. Discovery Source Strategy

Lead Center V2 supports a provider abstraction:

```text
OSMSource
   |
   +-- OverpassProvider
   |
   +-- PBFProvider
```

## 5.1 OverpassProvider

Purpose:

- prototype
- development
- query experiments
- sector benchmark tests
- small ad-hoc scans

Do NOT treat public Overpass servers as the long-term high-volume production backend.

Public Overpass instances are shared resources and explicitly recommend extracts/self-hosting for regular, high-volume, or commercial usage.

Therefore:

```text
Prototype -> Overpass
Normal daily production -> Local PBF
```

## 5.2 PBFProvider

Preferred long-term discovery source.

Use the Turkey extract from Geofabrik:

```text
turkey-latest.osm.pbf
```

The PBF file is stored locally.

Once downloaded:

- discovery queries do not consume API quota
- repeated filtering costs no money
- duplicates cost no external requests
- the app can search as much as needed
- the data can be imported into the local database

---

# 6. Recommended V2 Data Flow

```text
                  OSM DATA
                     |
          +----------+----------+
          |                     |
      Overpass               PBF File
   prototype/test         normal operation
          |                     |
          +----------+----------+
                     |
                     v
              OSM NORMALIZER
                     |
                     v
              SECTOR MAPPING
                     |
                     v
              DEDUPLICATION
                     |
                     v
             BUSINESS REGISTRY
                     |
                     v
               REVIEW QUEUE
                     |
          +----------+----------+
          |          |          |
       REJECT     FAVORITE    APPROVE
                                |
                                v
                            LEAD LIST
                                |
                                v
                               CRM
```

---

# 7. OSM Object Identity and Duplicate Handling

OSM contains nodes, ways, and relations.

The durable source key is:

```text
osm_type + osm_id
```

Example:

```text
node:7523932219
way:694298286
relation:123456
```

Database fields:

```text
osm_type
osm_id
```

with a unique composite constraint.

## 7.1 Basic duplicate rule

If the exact OSM identity already exists:

- update `last_seen_at`
- increment `times_seen`
- update raw OSM fields if desired
- do not create another business
- do not return rejected/contacted records to the normal review queue

## 7.2 Possible semantic duplicates

OSM may occasionally represent the same business twice, for example:

- a POI node
- a building/area way

Possible duplicate detection should use heuristics such as:

```text
normalized business name
+
distance threshold
+
same phone
+
same website
```

Do not automatically merge aggressively.

Instead mark:

```text
POSSIBLE_DUPLICATE
```

and allow manual merge/reject.

---

# 8. OSM Normalization Layer

Raw OSM tags should be preserved.

The normalizer should map common variants into normalized application fields.

## 8.1 Name

Preferred source:

```text
name
```

Fallbacks may include:

```text
brand
operator
```

but never silently invent a name.

## 8.2 Phone

Possible fields:

```text
phone
contact:phone
mobile
contact:mobile
```

Normalize format when possible and keep original value too.

## 8.3 Website

Possible fields:

```text
website
contact:website
url
```

## 8.4 Email

Possible fields:

```text
email
contact:email
```

## 8.5 Social links

Possible OSM tags may include:

```text
contact:instagram
contact:facebook
```

Also classify website-like values that are actually social or third-party destinations.

---

# 9. Website Source Classification

Suggested categories:

```text
UNKNOWN
OWN_WEBSITE
SOCIAL_ONLY
WHATSAPP_ONLY
THIRD_PARTY_BOOKING
MARKETPLACE_PROFILE
BROKEN_OR_INVALID
```

Examples:

```text
instagram.com/...       -> SOCIAL_ONLY
facebook.com/...        -> SOCIAL_ONLY
wa.me/...               -> WHATSAPP_ONLY
kolayrandevu.com/...    -> THIRD_PARTY_BOOKING
booksy.com/...           -> THIRD_PARTY_BOOKING
normalbusiness.com      -> OWN_WEBSITE
empty                    -> UNKNOWN
```

Important:

`UNKNOWN` does not mean “no website”.

---

# 10. Sector Architecture

Each sector must have two independent properties:

```text
commercial_priority
osm_coverage
```

Example:

```text
Beauty
Commercial priority: HIGH
OSM coverage: GOOD

Pilates
Commercial priority: HIGH
OSM coverage: LOW
```

This avoids confusing poor OSM coverage with poor commercial opportunity.

---

# 11. Initial Sector Library

## Tier A — Strong OSM discovery + strong commercial logic

- Beauty / Aesthetics
- Veterinary
- Tattoo
- Furniture / Custom Furniture
- Photography

## Tier B — Useful but requires filtering / has weaker OSM coverage

- Hairdresser / Premium Hair Studio
- Pilates / Reformer
- Auto Care / Detailing

## Disabled for OSM discovery in V1

- Interior Design
- Pet Grooming

Keep disabled sectors in the library so another provider can support them later.

---

# 12. Benchmark-Based Sector Notes

## Beauty / Aesthetics

```text
43 total
42 named
14 website-tagged
11 phone-tagged
```

Commercial priority: HIGH  
OSM coverage: GOOD

## Veterinary

```text
56 total
50 named
18 website-tagged
13 phone-tagged
```

Commercial priority: HIGH  
OSM coverage: GOOD

## Tattoo

```text
23 total
23 named
3 website-tagged
2 phone-tagged
```

Commercial priority: HIGH  
OSM coverage: GOOD

## Furniture / Custom

```text
49 total
45 named
10 website-tagged
0 phone-tagged
```

Commercial priority: HIGH  
OSM coverage: GOOD

## Photography

```text
16 total
13 named
2 website-tagged
1 phone-tagged
```

Commercial priority: MEDIUM_HIGH  
OSM coverage: MEDIUM

## Hairdresser / Barber

```text
167 total
155 named
16 website-tagged
16 phone-tagged
```

OSM coverage: EXCELLENT  
Commercial priority: MIXED

Use ranking rather than automatic rejection.

## Pilates

```text
11 total
11 named
4 website-tagged
1 phone-tagged
```

Commercial priority: HIGH  
OSM coverage: LOW

## Auto Care / Detailing

```text
12 total
4 named
2 website-tagged
0 phone-tagged
```

Commercial priority: HIGH  
OSM coverage: LOW / EXPERIMENTAL

## Interior Design

```text
0
```

Commercial priority may be high, but OSM discovery is disabled in V1.

## Pet Grooming

```text
2
```

Commercial priority may be useful, but OSM discovery is disabled in V1.

---

# 13. Sector Definitions

Sector definitions must be configurable rather than deeply hardcoded.

Example:

```json
{
  "name": "Beauty / Aesthetics",
  "osm_discovery_enabled": true,
  "commercial_priority": "HIGH",
  "osm_coverage": "GOOD",
  "rules": [
    {"tag": "shop", "value": "beauty"},
    {"name_regex": "beauty|güzellik|estetik|nail|tırnak|kalıcı makyaj|cilt bakım|lazer|laser"}
  ]
}
```

Hairdresser:

```json
{
  "rules": [
    {"tag": "shop", "value": "hairdresser"}
  ]
}
```

Veterinary:

```json
{
  "rules": [
    {"tag": "amenity", "value": "veterinary"}
  ]
}
```

Tattoo:

```json
{
  "rules": [
    {"tag": "shop", "value": "tattoo"}
  ]
}
```

Furniture:

```json
{
  "rules": [
    {"tag": "shop", "value": "furniture"},
    {"tag": "craft", "value": "carpenter"},
    {"name_regex": "mobilya|furniture|dekorasyon"}
  ]
}
```

Pilates:

```json
{
  "rules": [
    {"tag": "sport", "value": "pilates"},
    {"tag": "leisure", "value": "fitness_centre", "name_regex": "pilates|reformer"},
    {"name_regex": "pilates|reformer"}
  ]
}
```

---

# 14. Geography Model

The application should understand:

```text
CITY
DISTRICT
NEIGHBORHOOD
COMMERCIAL_AREA
```

Initial city:

```text
Istanbul
```

The V1 prototype does not need every Istanbul district preconfigured immediately.

Start with a small editable location library and expand.

---

# 15. Overpass Prototype Strategy

Overpass is used initially because it makes iteration easy.

The backend should generate valid Overpass QL for selected sector/location combinations.

Important:

- cache results locally
- do not repeatedly run identical queries unnecessarily
- include an identifying User-Agent
- no parallel query spam
- bounded retries only
- pause on 429/406
- log each discovery run

Public Overpass is not the final high-volume production source.

---

# 16. PBF Production Architecture

Preferred operation after prototype validation:

```text
Geofabrik
    |
    v
turkey-latest.osm.pbf
    |
    v
Local PBF Importer
    |
    v
Filter target POIs
    |
    v
Normalize
    |
    v
SQLite
```

Recommended refresh cadence:

```text
every 2 weeks
```

or:

```text
monthly
```

There is no need for daily full-dataset refresh.

---

# 17. Recommended PBF Technology

Use a mature OSM parser.

Recommended Python option:

```text
pyosmium
```

Possible flow:

```text
PBF
 ->
pyosmium handler
 ->
filter relevant tags
 ->
sector mapper
 ->
SQLite
```

If performance later becomes an issue, use `osmium` CLI preprocessing.

Do not manually parse PBF binary format.

---

# 18. Permanent SQLite Data Model

## `osm_businesses`

```text
id INTEGER PRIMARY KEY

osm_type TEXT NOT NULL
osm_id INTEGER NOT NULL

name TEXT

lat REAL
lon REAL

phone TEXT
website TEXT
email TEXT
opening_hours TEXT

address_text TEXT

raw_tags_json TEXT

normalized_website_type TEXT
sector_id INTEGER

first_seen_at DATETIME
last_seen_at DATETIME
times_seen INTEGER DEFAULT 1

record_state TEXT
favorite BOOLEAN DEFAULT FALSE

created_at DATETIME
updated_at DATETIME

UNIQUE(osm_type, osm_id)
```

## `sectors`

```text
id
name
commercial_priority
osm_coverage
osm_discovery_enabled
enabled
notes
```

## `sector_rules`

```text
id
sector_id
rule_type
tag_key
tag_value
regex
priority
enabled
```

## `locations`

```text
id
name
parent_location_id
location_type
enabled
```

## `discovery_runs`

```text
id
provider
sector_id
location_id
query_or_source
started_at
completed_at
result_count
new_count
known_count
error
```

## `manual_reviews`

```text
id
business_id UNIQUE

business_active
rebrand_status

verified_website_status
instagram_status

commercial_value
customer_value

contact_decision

manual_phone
manual_website
manual_instagram
manual_email
current_brand_name

notes

reviewed_at
updated_at
```

## `website_issues`

```text
id
manual_review_id
issue_code
```

## `lead_records`

```text
id
business_id UNIQUE

stage
lead_score

preferred_contact_channel
personalized_angle

estimated_scope
quoted_price

first_contact_at
last_contact_at
next_follow_up_at

won_value
lost_reason

created_at
updated_at
```

## `outreach_events`

```text
id
lead_record_id
event_type
channel
message_or_note
event_at
```

## `possible_duplicates`

```text
id
business_a_id
business_b_id
reason
confidence
status
```

## `app_settings`

```text
key
value
updated_at
```

---

# 19. Review State

Discovery/review state:

```text
DISCOVERED
IN_REVIEW
REJECTED
FAVORITED
APPROVED
```

CRM state is separate.

---

# 20. CRM State

Recommended:

```text
READY_TO_CONTACT
CONTACTED
NO_RESPONSE
REPLIED
FOLLOW_UP
MEETING
OFFER_SENT
WON
LOST
```

Full history must be stored as events.

---

# 21. Main Navigation

```text
Dashboard
Discover
Review Queue
Favorites
Lead List
CRM
Discovery
Settings
```

---

# 22. Discover / Market Screen

Example:

```text
--------------------------------------------------

BEAUTY CABIN SUADİYE

Sector:
Beauty / Aesthetics

Location:
Kadıköy

OSM website:
UNKNOWN

OSM phone:
UNKNOWN

Source:
OpenStreetMap

[Google Search]
[Open OSM]
[Review]

♡ Favorite
+ Add to Lead List
Reject

--------------------------------------------------
```

Filters:

```text
sector
location
OSM website type
has phone tag
has website tag
favorite
review state
date discovered
commercial priority
OSM coverage
```

---

# 23. Manual Review Workflow

The user is expected to research each business in external tabs.

Quick actions:

```text
Google Search
Open coordinates in Google Maps
Open OSM
Open website
```

Generate Google Search from:

```text
business name + district
```

No Google API is needed.

---

# 24. Manual Review Checklist

## Business validity

```text
Business currently active?

[ ] Yes
[ ] No
[ ] Uncertain
```

## Rebrand / ownership

```text
Possible rebrand or ownership change?

[ ] No
[ ] Possible
[ ] Confirmed
```

## Verified website status

```text
[ ] Not checked
[ ] No independent website
[ ] Social media only
[ ] Third-party booking/profile only
[ ] Website broken
[ ] Website severely outdated
[ ] Website poor
[ ] Website average
[ ] Website good
[ ] Website excellent
```

## Website issues

```text
[ ] Old design
[ ] Poor mobile experience
[ ] Slow
[ ] Broken links
[ ] Broken elements
[ ] Missing CTA
[ ] Weak WhatsApp/contact flow
[ ] Weak service presentation
[ ] Confusing navigation
[ ] Poor visual trust
[ ] Old content
[ ] Broken booking flow
[ ] No English option where valuable
[ ] Other
```

## Instagram/activity

```text
[ ] Active
[ ] Inactive
[ ] Not found
[ ] Not checked
```

## Reachability

```text
[ ] WhatsApp
[ ] Phone
[ ] Instagram DM
[ ] Email
[ ] Website contact form
[ ] In-person
```

## Commercial fit

```text
Would a professional website plausibly create value?

[ ] High
[ ] Medium
[ ] Low
[ ] Unclear
```

## Customer value

```text
[ ] High
[ ] Medium
[ ] Low
[ ] Unknown
```

## User decision

```text
Would I realistically contact this business?

[ ] Yes
[ ] Maybe
[ ] No
```

---

# 25. Manual Data Overrides

Verified user data should override raw OSM presentation.

Fields:

```text
manual_phone
manual_website
manual_instagram
manual_email
current_brand_name
```

The UI must distinguish:

```text
OSM data
Verified by me
```

---

# 26. Notes

Every business needs a large persistent notes area.

Expected content:

- Google Maps observations
- review recency
- website problems
- Instagram activity
- AI research result
- rebrand suspicion
- possible sales angle
- outreach context

---

# 27. Review Actions

## Reject

Never physically delete.

Suggested reasons:

```text
GOOD_WEBSITE
BUSINESS_CLOSED
REBRANDED
WEBSITE_NOT_USEFUL
TOO_LOW_VALUE
UNREACHABLE
WRONG_SECTOR
LOW_QUALITY_BUSINESS
DUPLICATE
OTHER
```

## Favorite

Meaning:

```text
Interesting; revisit later.
```

## Approve / Add to Lead List

Meaning:

```text
Real candidate for outreach.
```

---

# 28. Lead Score

Optional helper only.

Suggested structure:

```text
Website opportunity            0-30
Commercial website value       0-20
Business activity              0-15
Reachability                   0-15
Customer/project value         0-10
Personalized sales angle       0-10
                              -----
Total                           100
```

No automatic rejection based only on score.

---

# 29. Lead List

Approved businesses enter a persistent Lead List.

Store:

```text
preferred contact channel
personalized angle
message draft
estimated project scope
quoted price
CRM stage
```

---

# 30. Outreach Event History

Never overwrite history.

Example:

```text
2026-11-03
OUTBOUND / WhatsApp
"Merhaba..."

2026-11-06
NOTE
"Seen, no answer."

2026-11-10
FOLLOW_UP / Phone
"Owner asked for portfolio."
```

---

# 31. Dashboard

Track:

## Today

```text
new businesses imported
businesses reviewed
rejected
approved
messages sent
replies
meetings
offers
wins
```

## Month

```text
discovered
reviewed
approved
contacted
replied
meeting
offer
won
```

Ratios:

```text
review -> approve
contact -> reply
reply -> meeting
meeting -> offer
offer -> win
contact -> win
```

Sector performance should be visible after enough data exists.

---

# 32. Backend Stack

```text
Python 3.12+
FastAPI
SQLAlchemy 2.x
Alembic
SQLite
Pydantic Settings
httpx
```

OSM:

```text
Overpass prototype: httpx
PBF production: pyosmium
```

Optional later:

```text
Playwright
```

---

# 33. Backend Structure

```text
backend/
  app/
    main.py
    config.py
    database.py

    models/
    schemas/
    api/
      routes/

    services/
      osm/
        base.py
        normalizer.py
        sector_mapper.py
        dedup.py

        overpass/
          client.py
          query_builder.py
          importer.py

        pbf/
          importer.py
          handlers.py

      review/
        scoring.py

      crm/
        service.py

      backup/
        service.py

    repositories/
    migrations/
```

---

# 34. Provider Abstraction

```python
class OSMSource:
    def discover(self, sector, location):
        ...
```

Implementations:

```text
OverpassProvider
PBFProvider
```

The rest of the app must not care which source produced a business.

---

# 35. Frontend Stack

```text
React
TypeScript
Vite
React Router
TanStack Query
```

Styling:

```text
Tailwind CSS
```

or another lightweight system.

---

# 36. Local Runtime

No remote hosting.

Launcher:

```text
LeadCenter.bat
```

Startup:

```text
1. Start FastAPI
2. Start/serve React
3. Wait for health check
4. Open browser
```

Preferred URL:

```text
http://localhost:8000
```

---

# 37. Persistence

SQLite:

```text
data/lead_center.db
```

Git ignore:

```gitignore
.env
data/*.db
data/backups/
data/osm/
node_modules/
.venv/
```

---

# 38. OSM Data Folder

```text
data/
  lead_center.db

  osm/
    turkey-latest.osm.pbf

  backups/
```

Never commit PBF to GitHub.

---

# 39. Backups

Automatic SQLite backups:

```text
data/backups/
lead_center_2026-10-27_021500.db
```

Suggested retention:

```text
30 daily backups
```

---

# 40. No AI API

Do not integrate AI APIs.

Optional helper:

```text
Copy AI Research Context
```

This only generates clipboard text for manual use in ChatGPT/Claude/etc.

---

# 41. No Automatic Messaging

Do not automatically send:

- WhatsApp
- Instagram DMs
- email
- contact forms

The user manually sends outreach.

Lead Center stores and tracks it.

---

# 42. Website Analyzer

Not P0.

Possible later checks:

```text
HTTP status
HTTPS
redirect
viewport
title
meta description
load time
WhatsApp link
tel link
contact form
social links
broken internal links
```

Output factual observations only.

---

# 43. P0 Prototype Scope

Required:

1. FastAPI local backend.
2. SQLite + migrations.
3. React frontend.
4. Sector library.
5. Location library.
6. Overpass provider.
7. Run sector/location discovery.
8. Store raw OSM results.
9. Normalize records.
10. Deduplicate by OSM identity.
11. Discover/Market screen.
12. Review Queue.
13. Manual checklist.
14. Persistent notes.
15. Reject / Favorite / Approve.
16. Lead List.
17. Simple CRM.
18. Outreach event history.
19. Dashboard counts.
20. Local backup.

Not P0:

- PBF importer
- automatic website crawler
- advanced scoring
- automated messaging
- AI API
- cloud deployment
- user accounts
- mobile app
- SaaS billing
- Google Places
- Google Cloud

---

# 44. P1 After P0 Works

Add:

- Geofabrik PBF download/import
- PBFProvider
- periodic refresh
- semantic duplicate detection
- discovery run analytics
- website source classifier
- lead scoring
- sector performance analytics
- keyboard shortcuts
- CSV export
- improved backups
- follow-up reminders

---

# 45. P2 Only After Real Sales Validation

Only after outreach has produced real client work:

- richer website diagnostics
- other discovery providers
- scheduled local imports
- desktop packaging
- optional cloud sync
- reusable outreach templates

---

# 46. Prototype Acceptance Criteria

P0 succeeds when the user can:

1. Launch locally.
2. Choose Kadıköy + Beauty.
3. Run Overpass discovery.
4. Import real OSM businesses.
5. Restart without losing data.
6. Re-run without duplicate business records.
7. Browse businesses.
8. Open a review card.
9. Open Google Search manually.
10. Fill checklist.
11. Save notes.
12. Reject a business.
13. Re-run discovery and keep rejected business out of normal queue.
14. Favorite a business.
15. Approve a business.
16. See it in Lead List.
17. Mark it contacted.
18. Save exact message.
19. Record a reply/note.
20. Move it through CRM.
21. View simple activity counts.

---

# 47. Recommended Development Order

1. Repository skeleton.
2. FastAPI + React localhost startup.
3. SQLite + Alembic.
4. Sector + location configuration.
5. Overpass client.
6. Kadıköy Beauty discovery.
7. OSM normalization.
8. OSM ID deduplication.
9. Discover screen.
10. Review Queue.
11. Checklist + notes.
12. Reject / Favorite / Approve.
13. Lead List.
14. CRM.
15. Outreach history.
16. Dashboard.
17. Backups.
18. Only then begin PBFProvider.

---

# 48. Coding-Agent Rule

Do not over-engineer.

Do not turn this into:

- SaaS
- autonomous sales agent
- AI lead generator
- mass-messaging platform

Before adding a feature ask:

> Does this materially improve discovery, manual review, outreach tracking, or learning from results?

If not, defer it.

---

# 49. Manual Work Expected From the User

The user does NOT need to:

- create a Google Cloud project
- add billing
- create API keys
- pay for hosting
- configure a server
- buy a domain
- obtain an AI API key

During development, the user only needs to:

1. Confirm/edit initial sectors.
2. Confirm/edit initial Istanbul locations.
3. Test the P0 UI.
4. Test real discovery results.
5. Give feedback on workflow friction.

During actual prospecting, the user will:

1. Open Google Search / Google Maps manually.
2. Confirm business is active.
3. Check website.
4. Judge website quality.
5. Check Instagram/social activity when useful.
6. Detect possible rebrand/ownership change.
7. Optionally ask external AI to research.
8. Fill checklist.
9. Add notes.
10. Reject / Favorite / Approve.
11. Contact approved leads manually.
12. Record message and response.

Before P1/PBF:

No action is required now.

When PBF support is added, the user can download:

```text
turkey-latest.osm.pbf
```

from Geofabrik and place it in:

```text
data/osm/
```

The app may later automate update checks.

---

# 50. Current Benchmark Results

Kadıköy:

```text
Beauty / Aesthetics        43
Hairdresser / Barber      167
Veterinary                 56
Auto Care / Detailing      12
Tattoo                     23
Photography                16
Interior Design             0
Furniture / Custom         49
Pet Grooming                2
Pilates                    11
```

These numbers measure the current OSM discovery rules only.

They are NOT estimates of the true number of businesses in Kadıköy.

---

# 51. Product Success Metric

The real goal is not software completion.

The real goal is:

> Can consistent outreach produce paying web-development clients?

After one month the system should answer:

```text
How many businesses reviewed?
How many approved?
How many contacted?
How many replied?
How many meetings?
How many offers?
How many wins?
Which sectors converted best?
Why were businesses rejected?
```

---

# 52. Final Product Definition

Lead Center V2 is:

> A zero-recurring-cost, local-first Istanbul business discovery, qualification, and outreach CRM using OpenStreetMap as the discovery source and human verification as the decision layer.

The system intentionally combines:

```text
OPEN DATA
+
LOCAL SOFTWARE
+
HUMAN JUDGMENT
+
MANUAL OUTREACH
```

---

# 53. Official References

OpenStreetMap copyright / ODbL:
https://www.openstreetmap.org/copyright

Overpass API:
https://wiki.openstreetmap.org/wiki/Overpass_API

OSM data access APIs:
https://wiki.openstreetmap.org/wiki/APIs

Geofabrik Turkey extract:
https://download.geofabrik.de/europe/turkey.html

OSM API usage policy:
https://operations.osmfoundation.org/policies/api/

Nominatim policy:
https://operations.osmfoundation.org/policies/nominatim/

Public Nominatim must not be used as the bulk POI discovery engine.

---

# 54. Architecture Decisions

## ADR-001 — Google Places removed

Reason:

- billing friction
- possible prepayment
- unnecessary quota/cost risk
- OSM benchmark proved adequate for discovery

## ADR-002 — OSM is discovery, not truth

Missing OSM fields are unknown, not negative facts.

## ADR-003 — Overpass is prototype-only

Use public Overpass for P0/testing.

Use local extracts for regular/high-volume operation.

## ADR-004 — PBF is long-term source

Geofabrik Turkey PBF becomes the preferred high-volume local source after P0.

## ADR-005 — Manual verification remains mandatory

OSM cannot reliably provide:

- current operating status
- website quality
- review quality
- rebrands
- commercial fit
- real outreach opportunity

The human review layer remains essential.

---

# 55. Immediate Next Step for the Coding Agent

Give this file to the coding agent and say:

> Read the full specification first. Build only P0. Follow the Recommended Development Order. Start with a local FastAPI/React/SQLite skeleton and make the Kadıköy + Beauty path work end-to-end through Overpass. Do not implement PBF, AI integration, automatic messaging, Google Cloud, or advanced scoring yet.

The first milestone is:

```text
Kadıköy + Beauty
      ->
Overpass
      ->
SQLite
      ->
Discover screen
      ->
Review card
      ->
Reject / Favorite / Approve
      ->
persistent after restart
```
