import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useLocations, useSectors } from "../api/hooks";
import { STATE_VIEWS } from "../api/labels";
import type { BusinessFilters } from "../api/types";
import { secondaryFilterCount, WEBSITE_FILTER_OPTIONS, websiteFilterValue, withWebsiteFilter } from "../lib/logic";
import { Button, Field, SelectInput } from "./ui";

const PRIORITIES = ["HIGH", "MEDIUM_HIGH", "MEDIUM", "MIXED", "LOW"].map((v) => ({ value: v, label: v.replace("_", " ").toLowerCase() }));
const COVERAGES = ["EXCELLENT", "GOOD", "MEDIUM", "LOW", "VERY_LOW", "NONE"].map((v) => ({ value: v, label: v.replace("_", " ").toLowerCase() }));
const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
];

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
  const sectors = useSectors().data ?? [];
  const locations = useLocations().data ?? [];
  const extra = secondaryFilterCount(value, defaults);
  const [more, setMore] = useState(extra > 0);
  const set = (key: keyof BusinessFilters, v: string) => onChange({ ...value, [key]: v || undefined });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[minmax(12rem,1.4fr)_repeat(4,minmax(8rem,1fr))_auto]">
        <input className="control sm:col-span-2 lg:col-span-1" type="search" placeholder="Search name or address" aria-label="Search" value={value.q ?? ""} onChange={(e) => set("q", e.target.value)} />
        <SelectInput ariaLabel="Sector" value={value.sector_id ?? ""} onChange={(v) => set("sector_id", v)} placeholder="All sectors" options={sectors.map((s) => ({ value: String(s.id), label: s.name }))} />
        <SelectInput ariaLabel="Location" value={value.location_id ?? ""} onChange={(v) => set("location_id", v)} placeholder="All locations" options={locations.map((l) => ({ value: String(l.id), label: l.name }))} />
        <SelectInput ariaLabel="Website" value={websiteFilterValue(value)} onChange={(v) => onChange(withWebsiteFilter(value, v))} placeholder="Any website status" options={WEBSITE_FILTER_OPTIONS} />
        <SelectInput ariaLabel="Sort" value={value.sort ?? "newest"} onChange={(v) => set("sort", v)} options={SORTS} />
        <Button variant={more || extra ? "secondary" : "ghost"} onClick={() => setMore((m) => !m)} aria-expanded={more} className="sm:col-span-2 lg:col-span-1">
          <SlidersHorizontal className="h-4 w-4" /> More filters
          {extra > 0 && <span className="rounded-full bg-accent px-1.5 text-xs text-white">{extra}</span>}
        </Button>
      </div>

      {more && (
        <div className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Review state">
            <SelectInput value={value.state ?? ""} onChange={(v) => set("state", v)} options={STATE_VIEWS} />
          </Field>
          <Field label="Phone in OSM">
            <SelectInput
              value={value.has_phone ?? ""}
              onChange={(v) => set("has_phone", v)}
              placeholder="Any"
              options={[
                { value: "true", label: "Has a phone tag" },
                { value: "false", label: "No phone recorded (unknown)" },
              ]}
            />
          </Field>
          {!hideFavorite && (
            <Field label="Favorite">
              <SelectInput
                value={value.favorite ?? ""}
                onChange={(v) => set("favorite", v)}
                placeholder="Any"
                options={[
                  { value: "true", label: "Favorites only" },
                  { value: "false", label: "Not favorited" },
                ]}
              />
            </Field>
          )}
          <Field label="Commercial priority">
            <SelectInput value={value.commercial_priority ?? ""} onChange={(v) => set("commercial_priority", v)} placeholder="Any" options={PRIORITIES} />
          </Field>
          <Field label="OSM coverage">
            <SelectInput value={value.osm_coverage ?? ""} onChange={(v) => set("osm_coverage", v)} placeholder="Any" options={COVERAGES} />
          </Field>
          <Field label="Discovered since">
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
                Reset these filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
