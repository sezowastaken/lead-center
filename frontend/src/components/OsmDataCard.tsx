import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCw, Search, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { fmtDate, fmtDateTime, fmtNumber } from "../api/format";
import type { OsmDataStatus, OsmJob } from "../api/types";
import { translateServerText, useI18n, type MessageKey } from "../i18n";
import { Badge, Button, Card, CardHeader, ErrorNote } from "./ui";

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

const JOB_LABEL: Record<OsmJob["kind"], MessageKey> = { download: "osm.jobDownload", update: "osm.jobUpdate", import: "osm.jobImport" };
const JOB_STATUS: Record<OsmJob["status"], MessageKey> = {
  running: "osm.statusRunning",
  succeeded: "osm.statusDone",
  failed: "osm.statusFailed",
  cancelled: "osm.statusCancelled",
  unavailable: "osm.statusUnavailable",
};

/** Settings → OpenStreetMap data: the local extract and the explicit actions that change it. */
export default function OsmDataCard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["osm-data"],
    queryFn: api.osmData,
    refetchInterval: (q) => (q.state.data?.job?.status === "running" ? 1000 : false),
  });
  const d = status.data;
  const running = d?.job?.status === "running";

  // When a running job finishes, refresh everything an import may have changed.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) for (const key of ["businesses", "dashboard", "runs", "backups", "review-session", "coverage"]) qc.invalidateQueries({ queryKey: [key] });
    wasRunning.current = running;
  }, [running, qc]);

  const act = useMutation({
    mutationFn: (fn: () => Promise<OsmDataStatus>) => fn(),
    onSuccess: (data) => qc.setQueryData(["osm-data"], data),
  });
  const [confirmDownload, setConfirmDownload] = useState(false);
  const downloadSize = d?.last_check?.remote.size_bytes;
  const updateUnavailable = d?.last_update?.status === "unavailable";

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <CardHeader title={t("osm.title")} description={t("osm.description")} />
      <ErrorNote error={status.error ?? act.error} />

      {d && (
        <>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Row label={t("osm.localFile")}>
              {d.pbf ? (
                <span>
                  {d.file_name} · <strong className="font-medium">{fmtBytes(d.pbf.size_bytes)}</strong>
                </span>
              ) : (
                <span className="text-muted">{t("osm.notDownloaded")}</span>
              )}
            </Row>
            <Row label={t("osm.dataDate")}>{d.pbf?.data_timestamp ? fmtDateTime(d.pbf.data_timestamp) : "—"}</Row>
            <Row label={t("osm.downloadedAt")}>{d.pbf ? fmtDateTime(d.pbf.file_modified_at) : "—"}</Row>
            <Row label={t("osm.lastChecked")}>
              {d.last_check ? (
                <span className="flex flex-wrap items-center gap-2">
                  {fmtDateTime(d.last_check.checked_at)}
                  {d.pbf && d.last_check.behind_by != null && (
                    <Badge tone={d.last_check.behind_by > 0 ? "amber" : "green"}>
                      {d.last_check.behind_by > 0 ? t("osm.behind", { count: d.last_check.behind_by }) : t("osm.upToDate")}
                    </Badge>
                  )}
                </span>
              ) : (
                t("osm.never")
              )}
            </Row>
            <Row label={t("osm.lastImport")}>
              {d.last_import?.finished_at ? (
                <span className="flex flex-col">
                  <span>
                    {fmtDateTime(d.last_import.finished_at)} <JobBadge job={d.last_import} />
                  </span>
                  {d.last_import.message && <span className="t-caption">{translateServerText(d.last_import.message, t)}</span>}
                </span>
              ) : (
                t("osm.never")
              )}
            </Row>
            <Row label={t("osm.latestRemote")}>
              {d.last_check?.remote.latest_timestamp ? fmtDate(d.last_check.remote.latest_timestamp) : "—"}
              {downloadSize ? <span className="text-muted"> · {fmtBytes(downloadSize)}</span> : null}
            </Row>
          </dl>

          {/* Progress while running; afterwards only problems need the panel (successes show in the rows above). */}
          {d.job && (d.job.status === "running" || (d.job.status !== "succeeded" && isRecent(d.job))) && <JobPanel job={d.job} onCancel={() => act.mutate(api.osmCancel)} />}

          {updateUnavailable && !running && d.last_update?.message && (
            <p className="rounded-[var(--radius-control)] bg-amber-50 px-3 py-2 text-sm text-amber-900">{translateServerText(d.last_update.message, t)}</p>
          )}

          {confirmDownload ? (
            <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line bg-hover/60 p-4">
              <p className="text-[15px]">{t("osm.confirmDownload", { size: downloadSize ? fmtBytes(downloadSize) : "650 MB" })}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    setConfirmDownload(false);
                    act.mutate(api.osmDownload);
                  }}
                >
                  <Download className="h-4 w-4" /> {t("osm.startDownload")}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDownload(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!d.pbf ? (
                <Button variant="primary" disabled={running} onClick={() => setConfirmDownload(true)}>
                  <Download className="h-4 w-4" /> {t("osm.downloadLatest")}
                </Button>
              ) : (
                <>
                  <Button variant="primary" disabled={running} onClick={() => act.mutate(api.osmImport)}>
                    <Upload className="h-4 w-4" /> {d.last_import?.status === "succeeded" ? t("osm.reimport") : t("osm.import")}
                  </Button>
                  <Button variant="secondary" disabled={running || act.isPending} onClick={() => act.mutate(api.osmCheck)}>
                    <Search className="h-4 w-4" /> {t("osm.check")}
                  </Button>
                  <Button variant="secondary" disabled={running || updateUnavailable} onClick={() => act.mutate(api.osmUpdate)} title={t("osm.updateTitle")}>
                    <RefreshCw className="h-4 w-4" /> {t("osm.update")}
                  </Button>
                  <Button variant={updateUnavailable ? "primary" : "ghost"} disabled={running} onClick={() => setConfirmDownload(true)}>
                    <Download className="h-4 w-4" /> {t("osm.downloadFresh")}
                  </Button>
                </>
              )}
            </div>
          )}
          <p className="t-caption">{t("osm.footnote")}</p>
        </>
      )}
    </Card>
  );
}

function isRecent(job: OsmJob): boolean {
  return !!job.finished_at && Date.now() - new Date(job.finished_at + "Z").getTime() < 10 * 60 * 1000;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="t-caption">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function JobBadge({ job }: { job: OsmJob }) {
  const { t } = useI18n();
  const tone = job.status === "succeeded" ? "green" : job.status === "running" ? "accent" : job.status === "cancelled" ? "neutral" : "amber";
  return <Badge tone={tone}>{t(JOB_STATUS[job.status])}</Badge>;
}

function JobPanel({ job, onCancel }: { job: OsmJob; onCancel: () => void }) {
  const { t } = useI18n();
  const pct = job.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : null;
  const bytes = job.kind === "download";
  let progress = "";
  if (bytes) progress = job.total ? t("osm.progressOf", { done: fmtBytes(job.done), total: fmtBytes(job.total) }) : fmtBytes(job.done);
  else if (job.total) progress = t("osm.progressOf", { done: fmtNumber(job.done), total: fmtNumber(job.total) });
  else if (job.done) progress = t("osm.objectsScanned", { count: fmtNumber(job.done) });
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line p-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          {t(JOB_LABEL[job.kind])}: {translateServerText(job.phase, t)} <JobBadge job={job} />
        </span>
        {job.status === "running" && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-3.5 w-3.5" /> {t("common.cancel")}
          </Button>
        )}
      </div>
      {job.status === "running" && (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-2 rounded-full bg-accent transition-all ${pct == null ? "w-1/3 animate-pulse" : ""}`} style={pct != null ? { width: `${pct}%` } : undefined} />
          </div>
          <span className="t-caption tabular-nums">
            {progress}
            {pct != null ? ` · ${pct}%` : ""}
          </span>
        </>
      )}
      {job.status !== "running" && job.message && <p className="text-sm text-ink-2">{translateServerText(job.message, t)}</p>}
    </div>
  );
}
