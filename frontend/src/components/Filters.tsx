import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useLocations, useSectors } from "../api/hooks";
import { useLabels } from "../api/labels";
import type { BusinessFilters } from "../api/types";
import { useI18n, usePlaceName, useSectorName } from "../i18n";
import { secondaryFilterCount, WEBSITE_FILTER_OPTIONS, websiteFilterValue, withWebsiteFilter } from "../lib/logic";
import { Button, Field, SelectInput } from "./ui";

/** Discover filters: five primary controls, the rest behind "More filters" (spec §22). */
export default function Filters({
  value,
  onChange,
  defaults,
  hideFavorite = false,
}: {
  value: BusinessFilters;
  onChange: (next: BusinessFilters) => void;
  defaults: BusinessFilters;
  hideFavorite?: boolean;
}) {
  const { t } = useI18n();
  const L = useLabels();
  const sectorName = useSectorName();
  const placeName = usePlaceName();
  const sectors = useSectors().data ?? [];
  const locations = useLocations().data ?? [];
  const extra = secondaryFilterCount(value, defaults);
  const [more, setMore] = useState(extra > 0);
  const set = (key: keyof BusinessFilters, v: string) => onChange({ ...value, [key]: v || undefined });
  const sorts = [
    { value: "newest", label: t("filters.sortNewest") },
    { value: "oldest", label: t("filters.sortOldest") },
    { value: "name", label: t("filters.sortName") },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[minmax(12rem,1.4fr)_repeat(4,minmax(8rem,1fr))_auto]">
        <input
          className="control sm:col-span-2 lg:col-span-1"
          type="search"
          placeholder={t("filters.searchPlaceholder")}
          aria-label={t("filters.search")}
          value={value.q ?? ""}
          onChange={(e) => set("q", e.target.value)}
        />
        <SelectInput
          ariaLabel={t("common.sector")}
          value={value.sector_id ?? ""}
          onChange={(v) => set("sector_id", v)}
          placeholder={t("common.allSectors")}
          options={[...sectors.map((s) => ({ value: String(s.id), label: sectorName(s.name) })), { value: "none", label: t("common.unassigned") }]}
        />
        <SelectInput
          ariaLabel={t("common.location")}
          value={value.location_id ?? ""}
          onChange={(v) => set("location_id", v)}
          placeholder={t("common.allLocations")}
          options={[
            ...locations.map((l) => ({ value: String(l.id), label: l.location_type === "CITY" ? t("common.cityNoDistrict", { name: placeName(l.name) }) : placeName(l.name) })),
            { value: "none", label: t("common.unassigned") },
          ]}
        />
        <SelectInput
          ariaLabel={t("common.website")}
          value={websiteFilterValue(value)}
          onChange={(v) => onChange(withWebsiteFilter(value, v))}
          placeholder={t("filters.anyWebsite")}
          options={WEBSITE_FILTER_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
        />
        <SelectInput ariaLabel={t("filters.sort")} value={value.sort ?? "newest"} onChange={(v) => set("sort", v)} options={sorts} />
        <Button variant={more || extra ? "secondary" : "ghost"} onClick={() => setMore((m) => !m)} aria-expanded={more} className="sm:col-span-2 lg:col-span-1">
          <SlidersHorizontal className="h-4 w-4" /> {t("filters.more")}
          {extra > 0 && <span className="rounded-full bg-accent px-1.5 text-xs text-white">{extra}</span>}
        </Button>
      </div>

      {more && (
        <div className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("filters.reviewState")}>
            <SelectInput value={value.state ?? ""} onChange={(v) => set("state", v)} options={L.STATE_VIEWS} />
          </Field>
          <Field label={t("filters.phoneInOsm")}>
            <SelectInput
              value={value.has_phone ?? ""}
              onChange={(v) => set("has_phone", v)}
              placeholder={t("common.any")}
              options={[
                { value: "true", label: t("filters.hasPhone") },
                { value: "false", label: t("filters.noPhone") },
              ]}
            />
          </Field>
          {!hideFavorite && (
            <Field label={t("filters.favorite")}>
              <SelectInput
                value={value.favorite ?? ""}
                onChange={(v) => set("favorite", v)}
                placeholder={t("common.any")}
                options={[
                  { value: "true", label: t("filters.favoritesOnly") },
                  { value: "false", label: t("filters.notFavorited") },
                ]}
              />
            </Field>
          )}
          <Field label={t("filters.commercialPriority")}>
            <SelectInput value={value.commercial_priority ?? ""} onChange={(v) => set("commercial_priority", v)} placeholder={t("common.any")} options={L.PRIORITIES} />
          </Field>
          <Field label={t("filters.osmCoverage")}>
            <SelectInput value={value.osm_coverage ?? ""} onChange={(v) => set("osm_coverage", v)} placeholder={t("common.any")} options={L.COVERAGES} />
          </Field>
          <Field label={t("filters.discoveredSince")}>
            <input type="date" className="control" value={value.discovered_since ?? ""} onChange={(e) => set("discovered_since", e.target.value)} />
          </Field>
          {extra > 0 && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const reset = { ...value };
                  for (const k of ["state", "has_phone", "favorite", "commercial_priority", "osm_coverage", "discovered_since"] as const) reset[k] = defaults[k];
                  onChange(reset);
                }}
              >
                {t("filters.reset")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
