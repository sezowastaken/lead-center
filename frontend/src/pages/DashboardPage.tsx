import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BellRing, ClipboardCheck, Send, Trophy } from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { labelOf, REJECT_REASONS } from "../api/labels";
import type { Dashboard } from "../api/types";
import { Card, CardHeader, ErrorNote, PageHeader } from "../components/ui";
import { ratioView } from "../lib/logic";

function ActionCard({
  icon: Icon,
  value,
  label,
  to,
  cta,
  highlight,
}: {
  icon: ComponentType<{ className?: string }>;
  value: number;
  label: string;
  to: string;
  cta: string;
  highlight?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`card group flex flex-col gap-4 p-5 transition-shadow hover:shadow-[var(--shadow-raised)] ${highlight ? "ring-1 ring-amber-300" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${highlight ? "bg-amber-50 text-amber-700" : "bg-accent-soft text-accent"}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <ArrowRight className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-muted" />
      </div>
      <div>
        <div className="text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
        <div className="mt-0.5 text-[15px] text-ink-2">{label}</div>
      </div>
      <span className="text-sm font-medium text-accent-ink">{cta}</span>
    </Link>
  );
}

const FUNNEL: [keyof Dashboard["month"], string][] = [
  ["reviewed", "Reviewed"],
  ["approved", "Approved"],
  ["contacted", "Contacted"],
  ["replied", "Replied"],
  ["meetings", "Meetings"],
  ["offers", "Offers"],
  ["wins", "Won"],
];

const RATIOS: [string, string][] = [
  ["review_to_approve", "Review → approve"],
  ["contact_to_reply", "Contact → reply"],
  ["reply_to_meeting", "Reply → meeting"],
  ["meeting_to_offer", "Meeting → offer"],
  ["offer_to_win", "Offer → win"],
  ["contact_to_win", "Contact → win"],
];

export default function DashboardPage() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, staleTime: 0 });
  const d = q.data;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Dashboard" description={today} />
      <ErrorNote error={q.error} />
      {d && (
        <>
          <section aria-label="What to do now" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ActionCard icon={ClipboardCheck} value={d.totals.in_queue} label="Waiting for review" to="/review" cta="Start reviewing" />
            <ActionCard icon={Send} value={d.totals.ready_to_contact} label="Ready to contact" to="/leads?stage=READY_TO_CONTACT" cta="Open leads" />
            <ActionCard
              icon={BellRing}
              value={d.totals.follow_ups_due}
              label="Follow-ups due"
              to="/leads?due=1"
              cta="See follow-ups"
              highlight={d.totals.follow_ups_due > 0}
            />
            <ActionCard icon={Trophy} value={d.month.wins} label="Won this month" to="/crm" cta="Open pipeline" />
          </section>

          <Card className="flex flex-col gap-5 p-5 sm:p-6">
            <CardHeader
              title="This month"
              description={`Today: ${d.today.reviewed} reviewed · ${d.today.approved} approved · ${d.today.messages_sent} messages sent · ${d.today.replies} replies · ${d.today.discovered} new businesses`}
            />
            <ol className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
              {FUNNEL.map(([key, label], i) => (
                <li key={key} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-2xl font-semibold tabular-nums">{d.month[key]}</div>
                    <div className="t-caption">{label}</div>
                  </div>
                  {i < FUNNEL.length - 1 && <ArrowRight className="hidden h-4 w-4 shrink-0 text-subtle lg:block" />}
                </li>
              ))}
            </ol>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="flex flex-col gap-4 p-5 sm:p-6">
              <CardHeader title="Conversion" description="All time. Percentages from fewer than 5 cases are shown as small samples." />
              <ul className="flex flex-col divide-y divide-line-soft">
                {RATIOS.map(([key, label]) => {
                  const r = ratioView(d.ratios[key]);
                  return (
                    <li key={key} className="flex items-center justify-between gap-3 py-2.5 text-[15px]">
                      <span className="text-ink-2">{label}</span>
                      <span className="flex items-baseline gap-2 tabular-nums">
                        <span className="font-medium">{r.fraction}</span>
                        <span className={`text-[13px] ${r.lowSample ? "text-subtle" : "text-muted"}`}>
                          {r.pct == null ? "—" : r.lowSample ? `${r.pct} · small sample` : r.pct}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card className="flex flex-col gap-4 p-5 sm:p-6">
              <CardHeader title="Why businesses were rejected" />
              <RejectReasons data={d.reject_reasons} />
            </Card>
          </div>

          <Card className="flex flex-col gap-4 p-5 sm:p-6">
            <CardHeader title="Sector performance" description="Which sectors turn into conversations." />
            {d.sectors.length === 0 ? (
              <p className="t-caption">No data yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line-soft">
                {d.sectors.map((s) => (
                  <li key={s.sector} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium">{s.sector}</span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted tabular-nums">
                      <span>{s.discovered} found</span>
                      <span>{s.rejected} rejected</span>
                      <span className="text-ink-2">{s.approved} approved</span>
                      <span>{s.contacted} contacted</span>
                      <span>{s.replied} replied</span>
                      <span className={s.won ? "font-medium text-emerald-700" : ""}>{s.won} won</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function RejectReasons({ data }: { data: Dashboard["reject_reasons"] }) {
  if (data.length === 0) return <p className="t-caption">No rejections yet.</p>;
  const max = Math.max(...data.map((r) => r.count));
  return (
    <ul className="flex flex-col gap-3">
      {data.map((r) => (
        <li key={r.reason} className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span className="text-ink-2">{labelOf(REJECT_REASONS, r.reason)}</span>
            <span className="tabular-nums text-muted">{r.count}</span>
          </div>
          <div className="h-1.5 rounded-full bg-hover">
            <div className="h-1.5 rounded-full bg-accent/60" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
