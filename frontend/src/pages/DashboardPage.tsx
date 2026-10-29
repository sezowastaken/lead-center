import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BellRing, ClipboardCheck, Send, Trophy } from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { fmtNumber } from "../api/format";
import { labelOf, useLabels } from "../api/labels";
import type { Dashboard } from "../api/types";
import { getLocale, useI18n, useSectorName, type MessageKey } from "../i18n";
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
        <div className="text-3xl font-semibold tracking-tight tabular-nums">{fmtNumber(value)}</div>
        <div className="mt-0.5 text-[15px] text-ink-2">{label}</div>
      </div>
      <span className="text-sm font-medium text-accent-ink">{cta}</span>
    </Link>
  );
}

const FUNNEL: [keyof Dashboard["month"], MessageKey][] = [
  ["reviewed", "dash.funnelReviewed"],
  ["approved", "dash.funnelApproved"],
  ["contacted", "dash.funnelContacted"],
  ["replied", "dash.funnelReplied"],
  ["meetings", "dash.funnelMeetings"],
  ["offers", "dash.funnelOffers"],
  ["wins", "dash.funnelWon"],
];

const RATIOS: [string, MessageKey][] = [
  ["review_to_approve", "dash.ratioReviewApprove"],
  ["contact_to_reply", "dash.ratioContactReply"],
  ["reply_to_meeting", "dash.ratioReplyMeeting"],
  ["meeting_to_offer", "dash.ratioMeetingOffer"],
  ["offer_to_win", "dash.ratioOfferWin"],
  ["contact_to_win", "dash.ratioContactWin"],
];

export default function DashboardPage() {
  const { t } = useI18n();
  const sectorName = useSectorName();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, staleTime: 0 });
  const d = q.data;
  const today = new Date().toLocaleDateString(getLocale(), { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("nav.dashboard")} description={today} />
      <ErrorNote error={q.error} />
      {d && (
        <>
          <section aria-label={t("dash.whatNow")} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ActionCard icon={ClipboardCheck} value={d.totals.in_queue} label={t("dash.waiting")} to="/review" cta={t("dash.startReviewing")} />
            <ActionCard icon={Send} value={d.totals.ready_to_contact} label={t("dash.ready")} to="/leads?stage=READY_TO_CONTACT" cta={t("dash.openLeads")} />
            <ActionCard
              icon={BellRing}
              value={d.totals.follow_ups_due}
              label={t("dash.followUps")}
              to="/leads?due=1"
              cta={t("dash.seeFollowUps")}
              highlight={d.totals.follow_ups_due > 0}
            />
            <ActionCard icon={Trophy} value={d.month.wins} label={t("dash.wonMonth")} to="/crm" cta={t("dash.openPipeline")} />
          </section>

          <Card className="flex flex-col gap-5 p-5 sm:p-6">
            <CardHeader
              title={t("dash.thisMonth")}
              description={t("dash.todayLine", {
                reviewed: d.today.reviewed,
                approved: d.today.approved,
                sent: d.today.messages_sent,
                replies: d.today.replies,
                discovered: d.today.discovered,
              })}
            />
            <ol className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
              {FUNNEL.map(([key, label], i) => (
                <li key={key} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-2xl font-semibold tabular-nums">{fmtNumber(d.month[key])}</div>
                    <div className="t-caption">{t(label)}</div>
                  </div>
                  {i < FUNNEL.length - 1 && <ArrowRight className="hidden h-4 w-4 shrink-0 text-subtle lg:block" />}
                </li>
              ))}
            </ol>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="flex flex-col gap-4 p-5 sm:p-6">
              <CardHeader title={t("dash.conversion")} description={t("dash.conversionHint")} />
              <ul className="flex flex-col divide-y divide-line-soft">
                {RATIOS.map(([key, label]) => {
                  const r = ratioView(d.ratios[key]);
                  return (
                    <li key={key} className="flex items-center justify-between gap-3 py-2.5 text-[15px]">
                      <span className="text-ink-2">{t(label)}</span>
                      <span className="flex items-baseline gap-2 tabular-nums">
                        <span className="font-medium">{r.fraction}</span>
                        <span className={`text-[13px] ${r.lowSample ? "text-subtle" : "text-muted"}`}>
                          {r.pct == null ? "—" : r.lowSample ? t("dash.smallSample", { pct: r.pct }) : r.pct}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card className="flex flex-col gap-4 p-5 sm:p-6">
              <CardHeader title={t("dash.rejectReasons")} />
              <RejectReasons data={d.reject_reasons} />
            </Card>
          </div>

          <Card className="flex flex-col gap-4 p-5 sm:p-6">
            <CardHeader title={t("dash.sectorPerf")} description={t("dash.sectorPerfHint")} />
            {d.sectors.length === 0 ? (
              <p className="t-caption">{t("common.noDataYet")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line-soft">
                {d.sectors.map((s) => (
                  <li key={s.sector} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium">{sectorName(s.sector)}</span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted tabular-nums">
                      <span>{t("dash.found", { n: fmtNumber(s.discovered) })}</span>
                      <span>{t("dash.rejected", { n: fmtNumber(s.rejected) })}</span>
                      <span className="text-ink-2">{t("dash.approved", { n: fmtNumber(s.approved) })}</span>
                      <span>{t("dash.contacted", { n: fmtNumber(s.contacted) })}</span>
                      <span>{t("dash.replied", { n: fmtNumber(s.replied) })}</span>
                      <span className={s.won ? "font-medium text-emerald-700" : ""}>{t("dash.won", { n: fmtNumber(s.won) })}</span>
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
  const { t } = useI18n();
  const L = useLabels();
  if (data.length === 0) return <p className="t-caption">{t("dash.noRejections")}</p>;
  const max = Math.max(...data.map((r) => r.count));
  return (
    <ul className="flex flex-col gap-3">
      {data.map((r) => (
        <li key={r.reason} className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span className="text-ink-2">{labelOf(L.REJECT_REASONS, r.reason)}</span>
            <span className="tabular-nums text-muted">{fmtNumber(r.count)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-hover">
            <div className="h-1.5 rounded-full bg-accent/60" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
