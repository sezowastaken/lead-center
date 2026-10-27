import type {
  BusinessDetail,
  BusinessFilters,
  Backup,
  BusinessPage,
  Dashboard,
  DiscoveryRun,
  Lead,
  LeadDetail,
  LeadFields,
  Location,
  QueueNext,
  Review,
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
  queueNext: (filters: BusinessFilters, afterId?: number) =>
    request<QueueNext>(`/review-queue/next${qs({ ...filters, after_id: afterId })}`),

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
  backups: () => request<Backup[]>("/backups"),
  createBackup: () => post<Backup>("/backups"),
};
