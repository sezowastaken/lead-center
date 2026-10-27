import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup } from "lucide-react";
import { api } from "../api/client";
import { fmtDateTime } from "../api/format";
import { useLocations, useSectors } from "../api/hooks";
import { Badge, Button, Card, CardHeader, Disclosure, ErrorNote, PageHeader } from "../components/ui";

const nice = (v: string) => v.replace(/_/g, " ").toLowerCase();

export default function SettingsPage() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: Infinity });
  const sandbox = health.data?.profile === "sandbox";

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title="Settings" />
      <BackupsCard sandbox={sandbox} />
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
