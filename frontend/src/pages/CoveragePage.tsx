import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Coverage, CoveragePopulation, CoverageRow } from "../api/types";
import { Card, CardHeader, ErrorNote, Segmented } from "../components/ui";
import { browseLink, weightLabel } from "../lib/logic";

const POPULATIONS: { value: CoveragePopulation; label: string }[] = [
  { value: "waiting", label: "Waiting for review" },
  { value: "all", label: "All businesses" },
  { value: "decided", label: "Reviewed / decided" },
  { value: "approved", label: "Approved leads" },
  { value: "rejected", label: "Rejected" },
];

/** Discover → Coverage: where the registry's businesses are, by sector and location (counts from SQL on the server). */
export default function CoverageTab() {
  const [population, setPopulation] = useState<CoveragePopulation>("waiting");
  const q = useQuery({ queryKey: ["coverage", population], queryFn: () => api.coverage(population), placeholderData: keepPreviousData });
  const d = q.data;

  return (
    <div className="flex flex-col gap-6">
      <ErrorNote error={q.error} />
      {d && (
        <>
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Total businesses" value={d.totals.total} />
            <Stat label="Waiting for review" value={d.totals.waiting} />
            <Stat label="Reviewed / decided" value={d.totals.decided} />
            <Stat label="Approved leads" value={d.totals.approved} />
            <Stat label="Rejected" value={d.totals.rejected} />
          </section>

          <div className="flex flex-col gap-2">
            <span className="t-label">Show distribution for</span>
            <Segmented ariaLabel="Population" options={POPULATIONS} value={population} onChange={(v) => v && setPopulation(v as CoveragePopulation)} />
            <p className="t-caption">
              {d.population_total} business{d.population_total === 1 ? "" : "es"} · click any row or cell to open them in Browse
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Distribution title="By sector" rows={d.sectors} link={(r) => browseLink(d.browse_state, { sector: r.id })} weight />
            <Distribution title="By location" rows={d.locations} link={(r) => browseLink(d.browse_state, { location: r.id })} />
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
      <span className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</span>
      <span className="t-caption">{label}</span>
    </div>
  );
}

function Distribution<R extends CoverageRow & { review_weight?: number | null }>({
  title,
  rows,
  link,
  weight = false,
}: {
  title: string;
  rows: R[];
  link: (r: R) => string;
  weight?: boolean;
}) {
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
              aria-label={`${r.name}: ${r.count}`}
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={`min-w-0 truncate ${r.id === null ? "text-muted italic" : "text-ink-2 group-hover:text-ink"}`}>
                  {r.name}
                  {weight && r.review_weight != null && (
                    <span className="ml-2 text-xs text-subtle" title="Review priority: how often new review sessions pick this sector">
                      {weightLabel(r.review_weight)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-medium">{r.count.toLocaleString()}</span>
                  <span className="ml-2 inline-block w-12 text-right text-xs text-muted">{r.pct.toFixed(1)}%</span>
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
  const sectors = d.sectors.filter((s) => s.count > 0);
  const locations = d.locations.filter((l) => l.count > 0);
  const cell = new Map(d.cells.map((c) => [`${c.sector_id}|${c.location_id}`, c.count]));
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-5 sm:p-6">
      <CardHeader title="Sector × location" description="Counts for the selected population. Empty combinations are dots." />
      {sectors.length === 0 ? (
        <p className="t-caption">No businesses in this population.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1" role="region" aria-label="Sector by location matrix" tabIndex={0}>
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface p-2 text-left text-xs font-medium text-muted">Sector</th>
                {locations.map((l) => (
                  <th key={`${l.id}`} className="p-2 text-right text-xs font-medium whitespace-nowrap text-muted">
                    <Link to={browseLink(d.browse_state, { location: l.id })} className="hover:text-ink">
                      {l.name}
                    </Link>
                  </th>
                ))}
                <th className="p-2 text-right text-xs font-medium text-muted">Total</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((s) => (
                <tr key={`${s.id}`} className="group">
                  <th scope="row" className="sticky left-0 z-10 border-t border-line-soft bg-surface p-2 text-left font-normal whitespace-nowrap text-ink-2">
                    <Link to={browseLink(d.browse_state, { sector: s.id })} className={`hover:text-ink ${s.id === null ? "text-muted italic" : ""}`}>
                      {s.name}
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
                            aria-label={`${s.name} in ${l.name}: ${n}`}
                          >
                            {n}
                          </Link>
                        ) : (
                          <span className="block px-2 py-2 text-subtle">·</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-t border-line-soft p-2 text-right font-medium tabular-nums">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
