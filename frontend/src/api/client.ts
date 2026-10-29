import type {
  BusinessDetail,
  BusinessFilters,
  Backup,
  BusinessPage,
  Coverage,
  CoveragePopulation,
  Dashboard,
  DiscoveryRun,
  Lead,
  LeadDetail,
  LeadFields,
  Location,
  OsmDataStatus,
  Review,
  ReviewProgress,
  ReviewSessionView,
  Sector,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  health: () => request<{ status: string; profile: "user" | "sandbox" }>("/health"),
  sectors: () => request<Sector[]>("/sectors"),
  locations: () => request<Location[]>("/locations"),

  discoveryRuns: () => request<DiscoveryRun[]>("/discovery/runs"),
  runDiscovery: (body: { sector_id: number; location_id: number; force_refresh: boolean }) =>
    post<DiscoveryRun>("/discovery/runs", body),

  businesses: (filters: BusinessFilters, limit: number, offset: number) =>
    request<BusinessPage>(`/businesses${qs({ ...filters, limit, offset })}`),
  business: (id: number) => request<BusinessDetail>(`/businesses/${id}`),

  saveReview: (id: number, review: Review) =>
    request<BusinessDetail>(`/businesses/${id}/review`, { method: "PUT", body: JSON.stringify(review) }),
  reject: (id: number, reason: string, note: string) =>
    post<BusinessDetail>(`/businesses/${id}/reject`, { reason, note }),
  favorite: (id: number, favorite: boolean) => post<BusinessDetail>(`/businesses/${id}/favorite`, { favorite }),
  approve: (id: number) => post<BusinessDetail>(`/businesses/${id}/approve`),
  restore: (id: number) => post<BusinessDetail>(`/businesses/${id}/restore`),

  leads: (filters: { stage?: string; sector_id?: string; q?: string }) => request<Lead[]>(`/leads${qs(filters)}`),
  lead: (id: number) => request<LeadDetail>(`/leads/${id}`),
  updateLead: (id: number, fields: LeadFields) =>
    request<LeadDetail>(`/leads/${id}`, { method: "PUT", body: JSON.stringify(fields) }),
  changeStage: (id: number, stage: string, note?: string) => post<LeadDetail>(`/leads/${id}/stage`, { stage, note }),
  addEvent: (
    id: number,
    event: { event_type: string; channel: string | null; message_or_note: string | null; event_at: string | null; new_stage: string | null },
  ) => post<LeadDetail>(`/leads/${id}/events`, event),

  dashboard: () => request<Dashboard>("/dashboard"),
  coverage: (population: CoveragePopulation) => request<Coverage>(`/coverage${qs({ population })}`),
  setReviewWeight: (sectorId: number, weight: number) =>
    request<Sector>(`/sectors/${sectorId}/review-weight`, { method: "PUT", body: JSON.stringify({ review_weight: weight }) }),
  backups: () => request<Backup[]>("/backups"),
  createBackup: () => post<Backup>("/backups"),

  // OpenStreetMap data (local PBF). Download/update/import start background jobs.
  osmData: () => request<OsmDataStatus>("/osm-data"),
  osmCheck: () => post<OsmDataStatus>("/osm-data/check"),
  osmDownload: () => post<OsmDataStatus>("/osm-data/download"),
  osmUpdate: () => post<OsmDataStatus>("/osm-data/update"),
  osmImport: () => post<OsmDataStatus>("/osm-data/import"),
  osmCancel: () => post<OsmDataStatus>("/osm-data/cancel"),

  // Review sessions: a stored shuffled deck with a cursor.
  currentReviewSession: () => request<{ session: ReviewSessionView | null }>("/review-sessions/current"),
  eligibleForReview: (filters: { sector_id?: string; location_id?: string }) =>
    request<{ count: number; by_sector: { sector: string; count: number }[] }>(`/review-sessions/eligible${qs(filters)}`),
  startReviewSession: (filters: { sector_id?: number; location_id?: number }) => post<ReviewSessionView>("/review-sessions", filters),
  moveReviewSession: (id: number, action: "previous" | "next" | "advance") => post<ReviewSessionView>(`/review-sessions/${id}/move`, { action }),
  reviewProgress: () => request<ReviewProgress>("/review/progress"),
  setDailyTarget: (target: number) => request<ReviewProgress>("/review/daily-target", { method: "PUT", body: JSON.stringify({ target }) }),
};
