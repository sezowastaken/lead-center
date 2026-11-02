// Display of the business suitability score. The score itself is always computed by the backend
// (services/review/scoring.py); nothing here recalculates it.

import { Gauge } from "lucide-react";
import { fmtPercent } from "../api/format";
import { labelOf, useLabels } from "../api/labels";
import type { Suitability, SuitabilitySummary } from "../api/types";
import { useI18n, type MessageKey } from "../i18n";
import { Badge, Card, type Tone } from "./ui";

const BAND_TONE: Record<string, Tone> = { A: "green", B: "accent", C: "neutral", D: "amber", E: "neutral" };

/** "92 · A", or "Not eligible". */
export function ScoreBadge({ s, className = "" }: { s: SuitabilitySummary; className?: string }) {
  const { t } = useI18n();
  if (s.status === "NOT_ELIGIBLE") {
    return (
      <Badge tone="red" className={className}>
        {t("score.notEligible")}
      </Badge>
    );
  }
  return (
    <Badge tone={BAND_TONE[s.band ?? "E"]} className={`tabular-nums ${className}`}>
      {s.score} · {s.band}
      {s.status === "PROVISIONAL" && <span className="font-normal opacity-70">~</span>}
    </Badge>
  );
}

/** "Complete" or "Provisional · 60% complete". */
export function useScoreStatusText() {
  const { t } = useI18n();
  return (s: SuitabilitySummary) =>
    s.status === "COMPLETE" ? t("score.complete") : s.status === "NOT_ELIGIBLE" ? t("score.notEligible") : t("score.provisional", { pct: fmtPercent(s.completeness) });
}

function Headline({ s }: { s: SuitabilitySummary }) {
  const { t } = useI18n();
  const L = useLabels();
  const status = useScoreStatusText();
  return (
    <div className="flex flex-col gap-1">
      {s.status === "NOT_ELIGIBLE" ? (
        <>
          <span className="text-lg font-semibold text-rose-700">{t("score.notEligible")}</span>
          <span className="t-caption">{t("score.notEligibleHint")}</span>
        </>
      ) : (
        <>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-semibold tabular-nums">{t("score.value", { score: s.score ?? 0 })}</span>
            <span className="text-sm font-medium text-ink-2">{labelOf(L.SCORE_BANDS, s.band)}</span>
          </span>
          <span className={`text-[13px] ${s.status === "PROVISIONAL" ? "text-amber-800" : "text-emerald-700"}`}>{status(s)}</span>
        </>
      )}
      <span className="mt-1 text-sm">
        {t("score.recommended", { approach: "" })}
        <strong className="font-semibold">{labelOf(L.APPROACHES, s.recommendation)}</strong>
      </span>
    </div>
  );
}

function Breakdown({ s, bars = false }: { s: Suitability; bars?: boolean }) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-col gap-1.5" aria-label={t("score.breakdown")}>
      {s.components.map((c) => {
        const note = c.known === 0 ? t("score.missing") : c.known < c.max ? t("score.partial") : null;
        return (
          <li key={c.key} className="flex flex-col gap-1 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-ink-2">
                {t(`score.component.${c.key}` as MessageKey)}
                {note && <span className="ml-1.5 text-xs text-subtle italic">{note}</span>}
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {c.points}/{c.max}
              </span>
            </div>
            {bars && (
              <div className="h-1 rounded-full bg-hover">
                <div className="h-1 rounded-full bg-accent/60" style={{ width: `${(c.points / c.max) * 100}%` }} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Review screen: compact, read-only; follows the last saved answers. */
export function ScorePanel({ s, stale, className = "" }: { s: Suitability; stale?: boolean; className?: string }) {
  const { t } = useI18n();
  return (
    <Card className={`flex flex-col gap-3 p-5 transition-opacity ${stale ? "opacity-60" : ""} ${className}`} aria-busy={stale}>
      <h2 className="t-section flex items-center gap-2">
        <Gauge className="h-4 w-4 text-muted" aria-hidden /> {t("score.title")}
        {stale && <span className="text-xs font-normal text-muted">{t("score.updating")}</span>}
      </h2>
      <Headline s={s} />
      <div className="border-t border-line-soft pt-3">
        <Breakdown s={s} />
      </div>
    </Card>
  );
}

/** Lead page: full breakdown and why the recommendation was made. */
export function ScoreDetails({ s }: { s: Suitability }) {
  const { t } = useI18n();
  const L = useLabels();
  const reasonText = (code: string, value: string | number | null) => {
    if (code === "NO_OWN_WEBSITE" || code === "WEBSITE_NEEDS_WORK") return t(`score.reason.${code}`, { value: labelOf(L.VERIFIED_WEBSITE_STATUS, String(value)) });
    if (code === "PROVISIONAL") return t("score.reason.PROVISIONAL", { value: fmtPercent(Number(value)) });
    return t(`score.reason.${code}` as MessageKey, { value: value ?? "" });
  };
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 className="t-section flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted" aria-hidden /> {t("score.title")}
        </h2>
        <p className="t-caption mt-0.5">{t("score.hint")}</p>
      </div>
      <Headline s={s} />
      <p className="text-sm text-ink-2">{t(`score.approachHint.${s.recommendation}` as MessageKey)}</p>
      <div className="flex flex-col gap-2">
        <span className="t-label">{t("score.why")}</span>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-2">
          {s.reasons.map((r, i) => (
            <li key={i}>{reasonText(r.code, r.value)}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
        <span className="t-label">{t("score.breakdown")}</span>
        <Breakdown s={s} bars />
      </div>
    </Card>
  );
}
