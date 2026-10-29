import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { fmtDateTime } from "../api/format";
import { useLocations, useSectors } from "../api/hooks";
import OsmDataCard from "../components/OsmDataCard";
import { WEIGHT_MAX, WEIGHT_MIN, weightHint } from "../lib/logic";
import { Badge, Button, Card, CardHeader, Disclosure, ErrorNote, Field, PageHeader } from "../components/ui";

const nice = (v: string) => v.replace(/_/g, " ").toLowerCase();

export default function SettingsPage() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: Infinity });
  const sandbox = health.data?.profile === "sandbox";

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title="Settings" />
      <BackupsCard sandbox={sandbox} />
      <OsmDataCard />
      <ReviewTargetCard />
      <ReviewWeightsCard />
      <LibraryCard />

      <Card className="flex flex-col gap-2 p-5 sm:p-6">
        <CardHeader title="About the data" />
        <p className="text-[15px] text-ink-2">Business discovery data is derived from OpenStreetMap.</p>
        <p className="text-[15px] text-ink-2">
          © OpenStreetMap contributors, licensed under the{" "}
          <a className="text-accent-ink hover:underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            Open Database License (ODbL)
          </a>
          .
        </p>
        <p className="t-caption mt-1">
          When OSM has no website or phone for a business, that means it isn't recorded, not that it doesn't exist. Verify it yourself during review.
        </p>
      </Card>

      <AdvancedCard sandbox={sandbox} />
    </div>
  );
}

function BackupsCard({ sandbox }: { sandbox: boolean }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["backups"], queryFn: api.backups });
  const create = useMutation({ mutationFn: api.createBackup, onSuccess: () => qc.invalidateQueries({ queryKey: ["backups"] }) });
  const items = list.data ?? [];
  const latest = items[0];

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        title="Backups"
        description={
          sandbox
            ? "You are using the sandbox database. Its backups are kept separately in data/sandbox/backups/."
            : "A backup is made automatically once a day; the 30 newest are kept. Manual backups are never deleted."
        }
        actions={
          <Button variant="primary" disabled={create.isPending} onClick={() => create.mutate()}>
            <DatabaseBackup className="h-4 w-4" /> {create.isPending ? "Backing up…" : "Back up now"}
          </Button>
        }
      />
      <ErrorNote error={list.error ?? create.error} />
      {latest ? (
        <p className="text-[15px] text-ink-2">
          Latest backup: <strong className="font-medium">{fmtDateTime(latest.created_at)}</strong> · {items.length} stored
        </p>
      ) : (
        <p className="t-caption">No backups yet.</p>
      )}
      {items.length > 0 && (
        <Disclosure summary="Show backup files">
          <ul className="flex flex-col divide-y divide-line-soft">
            {items.slice(0, 15).map((b) => (
              <li key={b.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate font-mono text-[13px] text-ink-2">{b.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-muted">
                  {b.manual && <Badge tone="accent">manual</Badge>}
                  {(b.size_bytes / 1024).toFixed(0)} KB
                </span>
              </li>
            ))}
          </ul>
          <p className="t-caption mt-3">
            To restore: close Lead Center, copy a backup over <code>data/lead_center.db</code>, and delete any <code>lead_center.db-wal</code> /{" "}
            <code>-shm</code> files next to it.
          </p>
        </Disclosure>
      )}
    </Card>
  );
}

function LibraryCard() {
  const sectors = useSectors().data ?? [];
  const locations = useLocations().data ?? [];
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <CardHeader title="Sectors & locations" description="What you can search for, and where." />
      <ul className="flex flex-col divide-y divide-line-soft">
        {sectors.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className={s.osm_discovery_enabled ? "font-medium" : "font-medium text-muted"}>{s.name}</span>
            <span className="flex flex-wrap gap-1.5">
              <Badge tone="accent">priority {nice(s.commercial_priority)}</Badge>
              {s.osm_discovery_enabled ? <Badge>OSM coverage {nice(s.osm_coverage)}</Badge> : <Badge tone="red">not searchable in OSM</Badge>}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <span className="t-label">Locations</span>
        <div className="flex flex-wrap gap-1.5">
          {locations.map((l) => (
            <Badge key={l.id}>{l.name}</Badge>
          ))}
        </div>
      </div>
      <p className="t-caption">
        To add a district or change a sector, edit <code>backend/app/seed/locations.json</code> or <code>sectors.json</code> and restart Lead Center.
      </p>
    </Card>
  );
}

function AdvancedCard({ sandbox }: { sandbox: boolean }) {
  const sectors = useSectors().data ?? [];
  return (
    <Card className="p-5 sm:p-6">
      <Disclosure summary={<span className="t-section">Advanced</span>}>
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2 text-sm text-ink-2">
            <h3 className="t-label">Database</h3>
            <p>
              Active profile: <Badge tone={sandbox ? "amber" : "green"}>{sandbox ? "sandbox" : "real data"}</Badge>{" "}
              <code>{sandbox ? "data/sandbox/lead_center_sandbox.db" : "data/lead_center.db"}</code>
            </p>
            <p className="t-caption">
              Test in the sandbox with <code>uv run python -m app.sandbox</code> (port 8001). To start real prospecting from a clean slate, preview with{" "}
              <code>uv run python -m app.devtools reset-user-data</code>, then add <code>--yes</code>. A backup is always written first.
            </p>
          </section>

          <section className="flex flex-col gap-2 text-sm text-ink-2">
            <h3 className="t-label">Discovery source</h3>
            <p className="t-caption">
              Public Overpass API (prototype only), one request at a time, results cached for 24 hours. A local Geofabrik extract is planned for regular use.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="t-label">Sector matching rules</h3>
            <ul className="flex flex-col divide-y divide-line-soft">
              {sectors.map((s) => (
                <li key={s.id} className="flex flex-col gap-1.5 py-2.5">
                  <span className="text-sm font-medium">{s.name}</span>
                  {s.notes && <span className="t-caption">{s.notes}</span>}
                  <div className="flex flex-wrap gap-1">
                    {s.rules.length === 0 && <span className="t-caption">No rules</span>}
                    {s.rules.map((r) => (
                      <code key={r.id} className="max-w-full rounded bg-hover px-1.5 py-0.5 text-xs break-all text-ink-2">
                        {r.tag_key ? `${r.tag_key}=${r.tag_value}` : ""}
                        {r.tag_key && r.regex ? " + " : ""}
                        {r.regex ? `name ~ /${r.regex}/i` : ""}
                      </code>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Disclosure>
    </Card>
  );
}

function ReviewTargetCard() {
  const qc = useQueryClient();
  const progress = useQuery({ queryKey: ["review-progress"], queryFn: api.reviewProgress });
  const [value, setValue] = useState("");
  useEffect(() => {
    if (progress.data) setValue(String(progress.data.target));
  }, [progress.data]);
  const save = useMutation({ mutationFn: (t: number) => api.setDailyTarget(t), onSuccess: (p) => qc.setQueryData(["review-progress"], p) });
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 500;
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader title="Daily review target" description="Shown on the Review page as “12 / 30 reviewed today”." />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Businesses per day">
          <input className="control w-32" type="number" min={1} max={500} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Button variant="secondary" disabled={!valid || save.isPending || n === progress.data?.target} onClick={() => save.mutate(n)}>
          Save
        </Button>
      </div>
      <ErrorNote error={save.error} />
    </Card>
  );
}

/** Per-sector review weights: how often each sector comes up in NEW review sessions. */
function ReviewWeightsCard() {
  const qc = useQueryClient();
  const sectors = (useSectors().data ?? []).filter((s) => s.enabled && s.osm_discovery_enabled);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [savedId, setSavedId] = useState<number | null>(null);
  const save = useMutation({
    mutationFn: (v: { id: number; weight: number }) => api.setReviewWeight(v.id, v.weight),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["sectors"] });
      qc.invalidateQueries({ queryKey: ["coverage"] });
      setSavedId(v.id);
    },
  });
  const commit = (id: number, original: number) => {
    const w = draft[id];
    if (w !== undefined && w !== original) save.mutate({ id, weight: w });
  };

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        title="Review priority by sector"
        description="Higher-priority sectors come up more often early in a new review session; low ones are saved for later. Every waiting business is still included, and the same sector is never shown twice in a row when it can be avoided. Changes apply to new sessions only."
      />
      <ul className="flex flex-col divide-y divide-line-soft">
        {sectors.map((s) => {
          const original = s.review_weight ?? 1;
          const w = draft[s.id] ?? original;
          return (
            <li key={s.id} className="grid grid-cols-1 items-center gap-2 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_7.5rem]">
              <label htmlFor={`weight-${s.id}`} className="text-sm font-medium">
                {s.name}
              </label>
              <input
                id={`weight-${s.id}`}
                type="range"
                min={WEIGHT_MIN}
                max={WEIGHT_MAX}
                step={0.1}
                value={w}
                className="w-full accent-[var(--color-accent)]"
                onChange={(e) => setDraft((d) => ({ ...d, [s.id]: Number(e.target.value) }))}
                onPointerUp={() => commit(s.id, original)}
                onKeyUp={() => commit(s.id, original)}
                onBlur={() => commit(s.id, original)}
                aria-valuetext={`${w.toFixed(1)}, ${weightHint(w)}`}
              />
              <span className="text-sm tabular-nums text-ink-2">
                ×{w.toFixed(1)} <span className="t-caption">{savedId === s.id && !save.isPending && w === original ? "saved" : weightHint(w)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <ErrorNote error={save.error} />
    </Card>
  );
}
