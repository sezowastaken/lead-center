import { vi } from "vitest";
import type { BusinessDetail, Dashboard } from "../api/types";

export const business = (over: Partial<BusinessDetail> = {}): BusinessDetail => ({
  id: 7,
  osm_type: "node",
  osm_id: 123,
  osm_url: "https://www.openstreetmap.org/node/123",
  name: "Beauty Cabin Suadiye",
  name_source: "name",
  lat: 40.96,
  lon: 29.08,
  phone: "+90 216 555 12 34",
  phone_raw: "0216 555 12 34",
  website: null,
  email: null,
  opening_hours: null,
  address_text: null,
  osm_instagram: null,
  osm_facebook: null,
  normalized_website_type: "UNKNOWN",
  sector: { id: 1, name: "Beauty / Aesthetics", commercial_priority: "HIGH", osm_coverage: "GOOD" },
  location: { id: 2, name: "Kadıköy" },
  first_seen_at: "2026-10-27T00:00:00",
  last_seen_at: "2026-10-27T00:00:00",
  times_seen: 1,
  record_state: "DISCOVERED",
  favorite: false,
  reject_reason: null,
  reject_note: null,
  decided_at: null,
  has_review: false,
  has_notes: false,
  lead_record_id: null,
  raw_tags: { shop: "beauty", name: "Beauty Cabin Suadiye" },
  review: null,
  ...over,
});

const counts = { discovered: 0, reviewed: 0, rejected: 0, favorited: 0, approved: 0, messages_sent: 0, replies: 0, contacted: 0, replied: 0, meetings: 0, offers: 0, wins: 0, losses: 0 };
const ratio = { num: 0, den: 0, pct: null };

export const dashboard: Dashboard = {
  today: counts,
  month: counts,
  totals: { businesses: 38, in_queue: 12, favorites: 1, rejected: 0, approved: 0, ready_to_contact: 3, follow_ups_due: 2 },
  pipeline: [],
  ratios: { review_to_approve: ratio, contact_to_reply: ratio, reply_to_meeting: ratio, meeting_to_offer: ratio, offer_to_win: ratio, contact_to_win: ratio },
  sectors: [],
  reject_reasons: [],
};

/** Route-based fetch mock. Returns the list of calls for assertions. */
export function mockApi(overrides: Record<string, unknown> = {}) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  const routes: Record<string, unknown> = {
    "/api/health": { status: "ok", profile: "sandbox" },
    "/api/dashboard": dashboard,
    "/api/sectors": [],
    "/api/locations": [],
    "/api/discovery/runs": [],
    "/api/leads": [],
    "/api/backups": [],
    ...overrides,
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const path = url.split("?")[0];
    const match = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((k) => path === k || path.startsWith(k + "/"));
    let data = match ? routes[match] : { items: [], total: 0, limit: 60, offset: 0 };
    if (typeof data === "function") data = (data as (u: string, i?: RequestInit) => unknown)(url, init);
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}
