import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { fmtNumber, fmtPercent } from "../api/format";
import type { Coverage, CoveragePopulation, CoverageRow } from "../api/types";
import { Card, CardHeader, ErrorNote, Segmented } from "../components/ui";
import { useI18n, usePlaceName, useSectorName, type MessageKey } from "../i18n";
import { browseLink, weightLabel } from "../lib/logic";

const POPULATIONS: { value: CoveragePopulation; label: MessageKey }[] = [
  { value: "waiting", label: "coverage.waiting" },
  { value: "all", label: "coverage.all" },
  { value: "decided", label: "coverage.decided" },
  { value: "approved", label: "coverage.approved" },
  { value: "rejected", label: "coverage.rejected" },
];

type SectorRow = Coverage["sectors"][number];
type LocationRow = Coverage["locations"][number];

/** Display names: sectors in the UI language, city-level rows as "<city> (no district)", null ids as "Unassigned". */
function useRowNames() {
  const { t } = useI18n();
  const sectorName = useSectorName();
  const placeName = usePlaceName();
  return {
    sector: (r: SectorRow) => (r.id === null ? t("common.unassigned") : sectorName(r.name)),
    location: (r: LocationRow) => (r.id === null ? t("common.unassigned") : r.type === "CITY" ? t("common.cityNoDistrict", { name: placeName(r.name) }) : placeName(r.name)),
  };
}

/** Discover → Coverage: where the registry's businesses are, by sector and location (counts from SQL on the server). */
export default function CoverageTab() {
  const { t } = useI18n();
  const names = useRowNames();
  const [population, setPopulation] = useState<CoveragePopulation>("waiting");
  const q = useQuery({ queryKey: ["coverage", population], queryFn: () => api.coverage(population), placeholderData: keepPreviousData });
  const d = q.data;

  return (
    <div className="flex flex-col gap-6">
      <ErrorNote error={q.error} />
      {d && (
        <>
          <section aria-label={t("coverage.totals")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label={t("coverage.total")} value={d.totals.total} />
            <Stat label={t("coverage.waiting")} value={d.totals.waiting} />
            <Stat label={t("coverage.decided")} value={d.totals.decided} />
            <Stat label={t("coverage.approved")} value={d.totals.approved} />
            <Stat label={t("coverage.rejected")} value={d.totals.rejected} />
          </section>

          <div className="flex flex-col gap-2">
            <span className="t-label">{t("coverage.showFor")}</span>
            <Segmented
              ariaLabel={t("coverage.population")}
              options={POPULATIONS.map((p) => ({ value: p.value, label: t(p.label) }))}
              value={population}
              onChange={(v) => v && setPopulation(v as CoveragePopulation)}
            />
            <p className="t-caption">{t("coverage.summary", { count: d.population_total, n: fmtNumber(d.population_total) })}</p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Distribution title={t("coverage.bySector")} rows={d.sectors} name={names.sector} link={(r) => browseLink(d.browse_state, { sector: r.id })} weight />
            <Distribution title={t("coverage.byLocation")} rows={d.locations} name={names.location} link={(r) => browseLink(d.browse_state, { location: r.id })} />
          </div>

          <Matrix data={d} />
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card flex flex-col gap-0.5 p-4">
      <span className="text-2xl font-semibold tabular-nums">{fmtNumber(value)}</span>
      <span className="t-caption">{label}</span>
    </div>
  );
}

function Distribution<R extends CoverageRow & { review_weight?: number | null }>({
  title,
  rows,
  name,
  link,
  weight = false,
}: {
  title: string;
  rows: R[];
  name: (r: R) => string;
  link: (r: R) => string;
  weight?: boolean;
}) {
  const { t } = useI18n();
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className="flex flex-col gap-3 p-5 sm:p-6">
      <CardHeader title={title} />
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={`${r.id}`}>
            <Link
              to={link(r)}
              className={`group flex flex-col gap-1 rounded-md px-2 py-2 hover:bg-hover ${r.count === 0 ? "opacity-55" : ""}`}
              aria-label={`${name(r)}: ${r.count}`}
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={`min-w-0 truncate ${r.id === null ? "text-muted italic" : "text-ink-2 group-hover:text-ink"}`}>
                  {name(r)}
                  {weight && r.review_weight != null && (
                    <span className="ml-2 text-xs text-subtle" title={t("coverage.priorityTitle")}>
                      {weightLabel(r.review_weight, t)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-medium">{fmtNumber(r.count)}</span>
                  <span className="ml-2 inline-block w-12 text-right text-xs text-muted">{fmtPercent(r.pct, 1)}</span>
                </span>
              </div>
              <div className="h-1 rounded-full bg-hover">
                <div className="h-1 rounded-full bg-accent/55" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Sector × location. Scrolls inside its own container on narrow screens; the page itself never scrolls sideways. */
function Matrix({ data: d }: { data: Coverage }) {
  const { t } = useI18n();
  const names = useRowNames();
  const sectors = d.sectors.filter((s) => s.count > 0);
  const locations = d.locations.filter((l) => l.count > 0);
  const cell = new Map(d.cells.map((c) => [`${c.sector_id}|${c.location_id}`, c.count]));
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-5 sm:p-6">
      <CardHeader title={t("coverage.matrix")} description={t("coverage.matrixHint")} />
      {sectors.length === 0 ? (
        <p className="t-caption">{t("coverage.empty")}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1" role="region" aria-label={t("coverage.matrixLabel")} tabIndex={0}>
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface p-2 text-left text-xs font-medium text-muted">{t("common.sector")}</th>
                {locations.map((l) => (
                  <th key={`${l.id}`} className="p-2 text-right text-xs font-medium whitespace-nowrap text-muted">
                    <Link to={browseLink(d.browse_state, { location: l.id })} className="hover:text-ink">
                      {names.location(l)}
                    </Link>
                  </th>
                ))}
                <th className="p-2 text-right text-xs font-medium text-muted">{t("coverage.totalCol")}</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((s) => (
                <tr key={`${s.id}`} className="group">
                  <th scope="row" className="sticky left-0 z-10 border-t border-line-soft bg-surface p-2 text-left font-normal whitespace-nowrap text-ink-2">
                    <Link to={browseLink(d.browse_state, { sector: s.id })} className={`hover:text-ink ${s.id === null ? "text-muted italic" : ""}`}>
                      {names.sector(s)}
                    </Link>
                  </th>
                  {locations.map((l) => {
                    const n = cell.get(`${s.id}|${l.id}`) ?? 0;
                    return (
                      <td key={`${l.id}`} className="border-t border-line-soft p-0 text-right tabular-nums">
                        {n ? (
                          <Link
                            to={browseLink(d.browse_state, { sector: s.id, location: l.id })}
                            className="block px-2 py-2 hover:bg-accent-soft hover:text-accent-ink"
                            aria-label={t("coverage.cellLabel", { sector: names.sector(s), location: names.location(l), n })}
                          >
                            {fmtNumber(n)}
                          </Link>
                        ) : (
                          <span className="block px-2 py-2 text-subtle">·</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-t border-line-soft p-2 text-right font-medium tabular-nums">{fmtNumber(s.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
