import { useQuery } from "@tanstack/react-query";
import { BellRing, ChevronRight, MessageSquare } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { fmtDate, fmtDay, isDue } from "../api/format";
import { useSectors } from "../api/hooks";
import { CONTACT_CHANNELS, CRM_STAGES, labelOf } from "../api/labels";
import type { Lead } from "../api/types";
import { Badge, Button, ButtonLink, EmptyState, ErrorNote, PageHeader, SelectInput, StageBadge } from "../components/ui";

const CLOSED = new Set(["WON", "LOST"]);

/** Approved businesses (spec §29). Sorted by next follow-up, then most recently updated. */
export default function LeadListPage() {
  const sectors = useSectors().data ?? [];
  const [params, setParams] = useSearchParams();
  const stage = params.get("stage") ?? "";
  const sectorId = params.get("sector_id") ?? "";
  const q = params.get("q") ?? "";
  const due = params.get("due") === "1";
  const set = (key: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(key, v);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const leads = useQuery({
    queryKey: ["leads", { stage, sectorId, q }],
    queryFn: () => api.leads({ stage: stage || undefined, sector_id: sectorId || undefined, q: q || undefined }),
  });
  const items = (leads.data ?? []).filter((l) => !due || (isDue(l.next_follow_up_at) && !CLOSED.has(l.stage)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Leads" description="Approved businesses. Contact them yourself, then log what you sent and what happened." />

      <div className="flex flex-wrap items-center gap-3">
        <input className="control w-full sm:w-64" type="search" placeholder="Search leads" aria-label="Search leads" value={q} onChange={(e) => set("q", e.target.value)} />
        <SelectInput className="w-full sm:w-48" ariaLabel="Stage" value={stage} onChange={(v) => set("stage", v)} placeholder="All stages" options={CRM_STAGES} />
        <SelectInput className="w-full sm:w-56" ariaLabel="Sector" value={sectorId} onChange={(v) => set("sector_id", v)} placeholder="All sectors" options={sectors.map((s) => ({ value: String(s.id), label: s.name }))} />
        <Button variant={due ? "primary" : "secondary"} aria-pressed={due} onClick={() => set("due", due ? "" : "1")}>
          <BellRing className="h-4 w-4" /> Follow-ups due
        </Button>
      </div>

      <ErrorNote error={leads.error} />
      {leads.isLoading && <p className="t-caption">Loading…</p>}
      {leads.data && items.length === 0 && (
        <EmptyState
          title={due ? "No follow-ups due" : "No leads here yet"}
          action={!due && <ButtonLink to="/review" variant="primary">Go to Review</ButtonLink>}
        >
          {due ? "Nothing needs a follow-up today." : "Approve businesses during review and they appear here."}
        </EmptyState>
      )}
      <ul className="flex flex-col gap-3">
        {items.map((l) => (
          <li key={l.id}>
            <LeadRow lead={l} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function LeadRow({ lead: l }: { lead: Lead }) {
  const due = isDue(l.next_follow_up_at) && !CLOSED.has(l.stage);
  const note = l.latest_note ?? l.personalized_angle;
  return (
    <Link
      to={`/leads/${l.id}`}
      className="card group grid grid-cols-1 gap-3 p-4 transition-shadow hover:shadow-[var(--shadow-raised)] sm:p-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center md:gap-6"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[16px] font-semibold">{l.display_name ?? "Unnamed"}</span>
          <StageBadge stage={l.stage} label={labelOf(CRM_STAGES, l.stage)} />
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {l.business.sector?.name} · {l.business.location?.name}
        </p>
        {note && (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-2">
            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
            <span className="line-clamp-1">{note}</span>
          </p>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="t-caption">Channel</dt>
          <dd className="text-ink-2">{labelOf(CONTACT_CHANNELS, l.preferred_contact_channel) || "—"}</dd>
        </div>
        <div>
          <dt className="t-caption">Last contact</dt>
          <dd className="text-ink-2">{l.last_contact_at ? fmtDate(l.last_contact_at) : "Not yet"}</dd>
        </div>
        <div>
          <dt className="t-caption">Follow-up</dt>
          <dd>{due ? <Badge tone="amber">{fmtDay(l.next_follow_up_at)}</Badge> : <span className="text-ink-2">{fmtDay(l.next_follow_up_at)}</span>}</dd>
        </div>
      </dl>
      <span className="hidden items-center gap-1 text-sm font-medium text-accent-ink md:flex">
        Open <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
