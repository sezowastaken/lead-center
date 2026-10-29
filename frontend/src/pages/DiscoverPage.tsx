import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Database, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, Outlet, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { fmtDateTime } from "../api/format";
import { useLocations, useSectors } from "../api/hooks";
import type { BusinessFilters } from "../api/types";
import { useI18n, usePlaceName, useSectorName } from "../i18n";
import BusinessCard from "../components/BusinessCard";
import Filters from "../components/Filters";
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, ErrorNote, Field, PageHeader, SelectInput, Tabs } from "../components/ui";

const PAGE_SIZE = 60;

export default function DiscoverLayout() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("nav.discover")} description={t("discover.description")} />
      <Tabs
        items={[
          { to: "/discover/find", label: t("discover.tabFind") },
          { to: "/discover", label: t("discover.tabBrowse"), end: true },
          { to: "/discover/favorites", label: t("discover.tabFavorites") },
          { to: "/discover/coverage", label: t("discover.tabCoverage") },
        ]}
      />
      <Outlet />
    </div>
  );
}

/** Filters live in the URL so they survive navigating to a review and back. */
export function useUrlFilters(defaults: BusinessFilters) {
  const [params, setParams] = useSearchParams();
  const filters: BusinessFilters = { ...defaults };
  params.forEach((v, k) => {
    (filters as Record<string, string>)[k] = v;
  });
  const setFilters = (next: BusinessFilters) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && v !== (defaults as Record<string, string | undefined>)[k]) sp.set(k, v);
    setParams(sp, { replace: true });
  };
  return [filters, setFilters] as const;
}

/** Cards flow 1 → 2 → 3 columns by available width; they never shrink below a comfortable size. */
export function BusinessGrid({ filters, empty, summary }: { filters: BusinessFilters; empty: ReactNode; summary?: (total: number) => ReactNode }) {
  const { t } = useI18n();
  const query = useInfiniteQuery({
    queryKey: ["businesses", filters],
    queryFn: ({ pageParam }) => api.businesses(filters, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="t-caption" aria-live="polite">
        {query.isLoading ? t("common.loading") : summary ? summary(total) : t("discover.count", { count: total })}
      </p>
      <ErrorNote error={query.error} />
      {!query.isLoading && items.length === 0 && empty}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4">
        {items.map((b) => (
          <BusinessCard key={b.id} business={b} />
        ))}
      </div>
      {query.hasNextPage && (
        <Button variant="secondary" className="self-center" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {query.isFetchingNextPage ? t("common.loading") : t("discover.loadMore")}
        </Button>
      )}
    </div>
  );
}

const BROWSE_DEFAULTS: BusinessFilters = { state: "queue", sort: "newest" };

export function BrowseTab() {
  const { t } = useI18n();
  const [filters, setFilters] = useUrlFilters(BROWSE_DEFAULTS);
  const inQueue = (filters.state ?? "queue") === "queue";
  return (
    <div className="flex flex-col gap-5">
      <Filters value={filters} onChange={setFilters} defaults={BROWSE_DEFAULTS} />
      <BusinessGrid
        filters={filters}
        summary={(total) => (inQueue ? t("discover.queueSummary", { count: total }) : t("discover.count", { count: total }))}
        empty={
          <EmptyState title={t("discover.emptyTitle")} action={<ButtonLink to="/discover/find" variant="secondary">{t("discover.tabFind")}</ButtonLink>}>
            {t("discover.emptyBody")}
          </EmptyState>
        }
      />
    </div>
  );
}

const FAVORITE_DEFAULTS: BusinessFilters = { state: "active", sort: "newest" };

export function FavoritesTab() {
  const { t } = useI18n();
  const [filters, setFilters] = useUrlFilters(FAVORITE_DEFAULTS);
  return (
    <div className="flex flex-col gap-5">
      <Filters value={filters} onChange={setFilters} defaults={FAVORITE_DEFAULTS} hideFavorite />
      <BusinessGrid
        filters={{ ...filters, favorite: "true" }}
        summary={(total) => t("discover.favoritesSummary", { count: total })}
        empty={<EmptyState title={t("discover.noFavorites")}>{t("discover.noFavoritesBody")}</EmptyState>}
      />
    </div>
  );
}

export function FindTab() {
  const { t } = useI18n();
  const sectorName = useSectorName();
  const placeName = usePlaceName();
  const qc = useQueryClient();
  const sectors = useSectors().data ?? [];
  const locations = useLocations().data ?? [];
  const runs = useQuery({ queryKey: ["runs"], queryFn: api.discoveryRuns });
  const [sectorId, setSectorId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [force, setForce] = useState(false);

  const run = useMutation({
    mutationFn: () => api.runDiscovery({ sector_id: Number(sectorId), location_id: Number(locationId), force_refresh: force }),
    onSuccess: () => {
      for (const key of ["runs", "businesses", "queue", "dashboard"]) qc.invalidateQueries({ queryKey: [key] });
    },
  });
  const last = run.data;
  const sectorOptions = sectors.map((s) => ({
    value: String(s.id),
    label: s.osm_discovery_enabled ? sectorName(s.name) : t("find.notInOsm", { name: sectorName(s.name) }),
  }));

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <CardHeader title={t("discover.tabFind")} description={t("find.description")} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("common.sector")}>
            <SelectInput value={sectorId} onChange={setSectorId} placeholder={t("find.chooseSector")} options={sectorOptions} />
          </Field>
          <Field label={t("common.location")}>
            <SelectInput
              value={locationId}
              onChange={setLocationId}
              placeholder={t("find.chooseLocation")}
              options={locations.map((l) => ({ value: String(l.id), label: l.location_type === "CITY" ? t("find.wholeCity", { name: placeName(l.name) }) : placeName(l.name) }))}
            />
          </Field>
        </div>
        <label className="flex items-start gap-2.5 text-sm text-ink-2">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" checked={force} onChange={(e) => setForce(e.target.checked)} />
          <span>
            {t("find.fresh")}
            <span className="block t-caption">{t("find.freshHint")}</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            disabled={!sectorId || !locationId || run.isPending || sectors.find((s) => String(s.id) === sectorId)?.osm_discovery_enabled === false}
            onClick={() => run.mutate()}
          >
            <Search className="h-4 w-4" /> {run.isPending ? t("find.searching") : t("discover.tabFind")}
          </Button>
          {run.isPending && <span className="t-caption">{t("find.takesAMinute")}</span>}
        </div>
        <ErrorNote error={run.error} />
        {last &&
          (last.error ? (
            <ErrorNote error={t("find.failed", { error: last.error })} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] bg-accent-soft px-4 py-3 text-[15px]">
              <span>
                <strong>{t("find.newCount", { n: last.new_count })}</strong> · {t("find.knownCount", { n: last.known_count })} · {t("find.foundCount", { n: last.result_count })}
              </span>
              <Link className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline" to="/review">
                {t("find.reviewThem")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
      </Card>

      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <CardHeader title={t("find.recent")} />
        {(runs.data ?? []).length === 0 ? (
          <p className="t-caption">{t("find.noSearches")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-soft">
            {(runs.data ?? []).slice(0, 12).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {r.sector ? sectorName(r.sector.name) : t("find.pbfImport")} · {placeName(r.location?.name)}
                  </div>
                  <div className="t-caption">{fmtDateTime(r.started_at)}</div>
                </div>
                {r.error ? (
                  <Badge tone="red" className="max-w-full whitespace-normal">
                    {t("find.failedShort", { error: r.error })}
                  </Badge>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted tabular-nums">
                    <span className="text-ink-2">{t("find.newCount", { n: r.new_count })}</span>· {t("find.foundCount", { n: r.result_count })}
                    {r.from_cache && (
                      <Badge>
                        <Database className="h-3 w-3" /> {t("find.cached")}
                      </Badge>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
