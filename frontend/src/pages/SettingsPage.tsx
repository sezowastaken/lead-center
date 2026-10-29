import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { fmtDateTime, fmtNumber } from "../api/format";
import { useLocations, useSectors } from "../api/hooks";
import { labelOf, useLabels } from "../api/labels";
import OsmDataCard from "../components/OsmDataCard";
import { Badge, Button, Card, CardHeader, Disclosure, ErrorNote, Field, PageHeader, Segmented } from "../components/ui";
import { LANGS, useI18n, usePlaceName, useSectorName, type Lang } from "../i18n";
import { WEIGHT_MAX, WEIGHT_MIN, weightHint } from "../lib/logic";

/** Renders `backticked` parts of a translated sentence as <code>. */
function withCode(text: string): ReactNode {
  return text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>));
}

export default function SettingsPage() {
  const { t } = useI18n();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: Infinity });
  const sandbox = health.data?.profile === "sandbox";

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("nav.settings")} />
      <LanguageCard />
      <BackupsCard sandbox={sandbox} />
      <OsmDataCard />
      <ReviewTargetCard />
      <ReviewWeightsCard />
      <LibraryCard />

      <Card className="flex flex-col gap-2 p-5 sm:p-6">
        <CardHeader title={t("settings.about")} />
        <p className="text-[15px] text-ink-2">{t("settings.aboutDerived")}</p>
        <p className="text-[15px] text-ink-2">
          {t("settings.aboutLicense")}{" "}
          <a className="text-accent-ink hover:underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            Open Database License (ODbL)
          </a>
          .
        </p>
        <p className="t-caption mt-1">{t("settings.aboutUnknown")}</p>
      </Card>

      <AdvancedCard sandbox={sandbox} />
    </div>
  );
}

function LanguageCard() {
  const { t, lang, setLang } = useI18n();
  return (
    <Card className="flex flex-col gap-3 p-5 sm:p-6">
      <CardHeader title={t("settings.language")} description={t("settings.languageHint")} />
      <Segmented ariaLabel={t("settings.language")} options={LANGS} value={lang} onChange={(v) => v && setLang(v as Lang)} />
    </Card>
  );
}

function BackupsCard({ sandbox }: { sandbox: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["backups"], queryFn: api.backups });
  const create = useMutation({ mutationFn: api.createBackup, onSuccess: () => qc.invalidateQueries({ queryKey: ["backups"] }) });
  const items = list.data ?? [];
  const latest = items[0];

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        title={t("settings.backups")}
        description={sandbox ? t("settings.backupsSandbox") : t("settings.backupsHint")}
        actions={
          <Button variant="primary" disabled={create.isPending} onClick={() => create.mutate()}>
            <DatabaseBackup className="h-4 w-4" /> {create.isPending ? t("settings.backingUp") : t("settings.backUpNow")}
          </Button>
        }
      />
      <ErrorNote error={list.error ?? create.error} />
      {latest ? (
        <p className="text-[15px] text-ink-2">
          {t("settings.latestBackup")} <strong className="font-medium">{fmtDateTime(latest.created_at)}</strong> · {t("settings.stored", { count: items.length })}
        </p>
      ) : (
        <p className="t-caption">{t("settings.noBackups")}</p>
      )}
      {items.length > 0 && (
        <Disclosure summary={t("settings.showBackupFiles")}>
          <ul className="flex flex-col divide-y divide-line-soft">
            {items.slice(0, 15).map((b) => (
              <li key={b.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate font-mono text-[13px] text-ink-2">{b.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-muted">
                  {b.manual && <Badge tone="accent">{t("settings.manual")}</Badge>}
                  {(b.size_bytes / 1024).toFixed(0)} KB
                </span>
              </li>
            ))}
          </ul>
          <p className="t-caption mt-3">{withCode(t("settings.restoreHint"))}</p>
        </Disclosure>
      )}
    </Card>
  );
}

function LibraryCard() {
  const { t } = useI18n();
  const L = useLabels();
  const sectorName = useSectorName();
  const placeName = usePlaceName();
  const sectors = useSectors().data ?? [];
  const locations = useLocations().data ?? [];
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <CardHeader title={t("settings.library")} description={t("settings.libraryHint")} />
      <ul className="flex flex-col divide-y divide-line-soft">
        {sectors.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className={s.osm_discovery_enabled ? "font-medium" : "font-medium text-muted"}>{sectorName(s.name)}</span>
            <span className="flex flex-wrap gap-1.5">
              <Badge tone="accent">{t("settings.priority", { value: labelOf(L.PRIORITIES, s.commercial_priority) })}</Badge>
              {s.osm_discovery_enabled ? (
                <Badge>{t("settings.coverage", { value: labelOf(L.COVERAGES, s.osm_coverage) })}</Badge>
              ) : (
                <Badge tone="red">{t("settings.notSearchable")}</Badge>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <span className="t-label">{t("settings.locations")}</span>
        <div className="flex flex-wrap gap-1.5">
          {locations.map((l) => (
            <Badge key={l.id}>{placeName(l.name)}</Badge>
          ))}
        </div>
      </div>
      <p className="t-caption">{withCode(t("settings.libraryEdit"))}</p>
    </Card>
  );
}

function AdvancedCard({ sandbox }: { sandbox: boolean }) {
  const { t } = useI18n();
  const sectorName = useSectorName();
  const sectors = useSectors().data ?? [];
  return (
    <Card className="p-5 sm:p-6">
      <Disclosure summary={<span className="t-section">{t("settings.advanced")}</span>}>
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2 text-sm text-ink-2">
            <h3 className="t-label">{t("settings.database")}</h3>
            <p>
              {t("settings.activeProfile")} <Badge tone={sandbox ? "amber" : "green"}>{sandbox ? t("settings.profileSandbox") : t("settings.profileReal")}</Badge>{" "}
              <code>{sandbox ? "data/sandbox/lead_center_sandbox.db" : "data/lead_center.db"}</code>
            </p>
            <p className="t-caption">{withCode(t("settings.databaseHint"))}</p>
          </section>

          <section className="flex flex-col gap-2 text-sm text-ink-2">
            <h3 className="t-label">{t("settings.discoverySource")}</h3>
            <p className="t-caption">{t("settings.discoverySourceHint")}</p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="t-label">{t("settings.rules")}</h3>
            <ul className="flex flex-col divide-y divide-line-soft">
              {sectors.map((s) => (
                <li key={s.id} className="flex flex-col gap-1.5 py-2.5">
                  <span className="text-sm font-medium">{sectorName(s.name)}</span>
                  {s.notes && <span className="t-caption">{s.notes}</span>}
                  <div className="flex flex-wrap gap-1">
                    {s.rules.length === 0 && <span className="t-caption">{t("settings.noRules")}</span>}
                    {s.rules.map((r) => (
                      <code key={r.id} className="max-w-full rounded bg-hover px-1.5 py-0.5 text-xs break-all text-ink-2">
                        {r.tag_key ? `${r.tag_key}=${r.tag_value}` : ""}
                        {r.tag_key && r.regex ? " + " : ""}
                        {r.regex ? `${r.regex_key ?? "name"} ~ /${r.regex}/i` : ""}
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
  const { t } = useI18n();
  const qc = useQueryClient();
  const progress = useQuery({ queryKey: ["review-progress"], queryFn: api.reviewProgress });
  const [value, setValue] = useState("");
  useEffect(() => {
    if (progress.data) setValue(String(progress.data.target));
  }, [progress.data]);
  const save = useMutation({ mutationFn: (target: number) => api.setDailyTarget(target), onSuccess: (p) => qc.setQueryData(["review-progress"], p) });
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 500;
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader title={t("settings.target")} description={t("settings.targetHint")} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("settings.perDay")}>
          <input className="control w-32" type="number" min={1} max={500} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Button variant="secondary" disabled={!valid || save.isPending || n === progress.data?.target} onClick={() => save.mutate(n)}>
          {t("common.save")}
        </Button>
      </div>
      <ErrorNote error={save.error} />
    </Card>
  );
}

/** Per-sector review weights: how often each sector comes up in NEW review sessions. */
function ReviewWeightsCard() {
  const { t } = useI18n();
  const sectorName = useSectorName();
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
      <CardHeader title={t("settings.weights")} description={t("settings.weightsHint")} />
      <ul className="flex flex-col divide-y divide-line-soft">
        {sectors.map((s) => {
          const original = s.review_weight ?? 1;
          const w = draft[s.id] ?? original;
          return (
            <li key={s.id} className="grid grid-cols-1 items-center gap-2 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_7.5rem]">
              <label htmlFor={`weight-${s.id}`} className="text-sm font-medium">
                {sectorName(s.name)}
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
                aria-valuetext={`${fmtNumber(w, 1)}, ${weightHint(w, t)}`}
              />
              <span className="text-sm tabular-nums text-ink-2">
                ×{fmtNumber(w, 1)} <span className="t-caption">{savedId === s.id && !save.isPending && w === original ? t("save.saved") : weightHint(w, t)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <ErrorNote error={save.error} />
    </Card>
  );
}
