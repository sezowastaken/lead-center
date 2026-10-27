import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { fmtDate, fmtDay, isDue } from "../api/format";
import { CRM_STAGES } from "../api/labels";
import type { Lead } from "../api/types";
import { Badge, Card, CardHeader, ErrorNote, PageHeader } from "../components/ui";

const ACTIVE = CRM_STAGES.filter((s) => s.value !== "WON" && s.value !== "LOST");
const CLOSED = CRM_STAGES.filter((s) => s.value === "WON" || s.value === "LOST");

/** Pipeline (spec §20). Stages wrap into a responsive grid — never a horizontal scroll. Moving a card records a stage-change event. */
export default function CrmPage() {
  const qc = useQueryClient();
  const leads = useQuery({ queryKey: ["leads", {}], queryFn: () => api.leads({}) });
  const move = useMutation({
    mutationFn: (v: { id: number; stage: string }) => api.changeStage(v.id, v.stage),
    onSuccess: () => {
      for (const key of ["leads", "lead", "dashboard"]) qc.invalidateQueries({ queryKey: [key] });
    },
  });
  const all = leads.data ?? [];
  const byStage = (stage: string) => all.filter((l) => l.stage === stage);
  const due = all.filter((l) => isDue(l.next_follow_up_at) && l.stage !== "WON" && l.stage !== "LOST");
  const open = all.length - byStage("WON").length - byStage("LOST").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="CRM" description={`${open} open lead${open === 1 ? "" : "s"}. Every stage change is kept in the lead's history.`} />
      <ErrorNote error={leads.error ?? move.error} />

      {due.length > 0 && (
        <Card className="flex flex-col gap-3 p-5 ring-1 ring-amber-300">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-amber-600" /> Follow-ups due ({due.length})
              </span>
            }
          />
          <ul className="flex flex-col divide-y divide-line-soft">
            {due.map((l) => (
              <li key={l.id}>
                <Link to={`/leads/${l.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-accent-ink">
                  <span className="min-w-0 truncate font-medium">{l.display_name ?? "Unnamed"}</span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
                    <Badge tone="amber">{fmtDay(l.next_follow_up_at)}</Badge>
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section aria-label="Active pipeline" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ACTIVE.map((s) => (
          <StageColumn key={s.value} stage={s.value} label={s.label} leads={byStage(s.value)} onMove={(id, stage) => move.mutate({ id, stage })} pending={move.isPending} />
        ))}
      </section>

      <section aria-label="Closed" className="flex flex-col gap-3">
        <h2 className="t-overline">Closed</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CLOSED.map((s) => (
            <StageColumn key={s.value} stage={s.value} label={s.label} leads={byStage(s.value)} onMove={(id, stage) => move.mutate({ id, stage })} pending={move.isPending} />
          ))}
        </div>
      </section>
    </div>
  );
}

function StageColumn({
  stage,
  label,
  leads,
  onMove,
  pending,
}: {
  stage: string;
  label: string;
  leads: Lead[];
  onMove: (id: number, stage: string) => void;
  pending: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] bg-hover/70 p-2.5" data-stage={stage}>
      <h3 className="flex items-center justify-between px-1.5 py-1 text-sm font-semibold text-ink-2">
        {label}
        <span className="text-xs font-normal text-muted tabular-nums">{leads.length}</span>
      </h3>
      {leads.length === 0 && <p className="px-1.5 pb-1 text-[13px] text-subtle">No leads</p>}
      {leads.map((l) => (
        <LeadCard key={l.id} lead={l} onMove={(s) => onMove(l.id, s)} pending={pending} />
      ))}
    </div>
  );
}

function LeadCard({ lead: l, onMove, pending }: { lead: Lead; onMove: (stage: string) => void; pending: boolean }) {
  const due = isDue(l.next_follow_up_at) && l.stage !== "WON" && l.stage !== "LOST";
  return (
    <article className="card flex flex-col gap-2 p-3">
      <Link to={`/leads/${l.id}`} className="leading-snug font-medium hover:underline">
        {l.display_name ?? "Unnamed"}
      </Link>
      <span className="text-[13px] text-muted">{l.business.sector?.name}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
        <span>{l.last_contact_at ? `Contacted ${fmtDate(l.last_contact_at)}` : "Not contacted yet"}</span>
        {l.next_follow_up_at && (due ? <Badge tone="amber">Follow up {fmtDay(l.next_follow_up_at)}</Badge> : <span>Follow up {fmtDay(l.next_follow_up_at)}</span>)}
      </div>
      <select className="control h-8 text-[13px]" value={l.stage} disabled={pending} onChange={(e) => onMove(e.target.value)} aria-label={`Move ${l.display_name ?? "lead"} to stage`}>
        {CRM_STAGES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.value === l.stage ? s.label : `Move to ${s.label}`}
          </option>
        ))}
      </select>
    </article>
  );
}
