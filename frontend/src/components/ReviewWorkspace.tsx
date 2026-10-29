import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CheckCircle2, Heart, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { fmtDate } from "../api/format";
import { useBusinessActions } from "../api/hooks";
import { labelOf, useLabels, type Labels } from "../api/labels";
import { displayName, externalUrl } from "../api/links";
import type { BusinessDetail, Review } from "../api/types";
import { useI18n, usePlaceName, useSectorName, type T } from "../i18n";
import QuickLinks from "./QuickLinks";
import RejectControl from "./RejectControl";
import { Badge, Button, ButtonLink, Card, CheckboxGrid, Disclosure, ErrorNote, OsmValue, SelectInput, Segmented, StateBadge, ToggleChips } from "./ui";

export const EMPTY_REVIEW: Review = {
  business_active: null,
  rebrand_status: null,
  verified_website_status: null,
  website_issues: [],
  instagram_status: null,
  reachability: [],
  commercial_value: null,
  customer_value: null,
  contact_decision: null,
  manual_phone: null,
  manual_website: null,
  manual_instagram: null,
  manual_email: null,
  current_brand_name: null,
  notes: null,
};

function toForm(b: BusinessDetail): Review {
  const form = { ...EMPTY_REVIEW };
  if (!b.review) return form;
  for (const k of Object.keys(EMPTY_REVIEW) as (keyof Review)[]) (form as Record<string, unknown>)[k] = b.review[k];
  return form;
}

// Verified website status, grouped so the long list reads as two simple questions.
function websiteStatusGroups(L: Labels, t: T) {
  const pick = (values: string[]) => L.VERIFIED_WEBSITE_STATUS.filter((o) => values.includes(o.value));
  return [
    { group: t("review.groupNoSite"), options: pick(["NO_INDEPENDENT_WEBSITE", "SOCIAL_ONLY", "THIRD_PARTY_ONLY"]) },
    { group: t("review.groupHasSite"), options: pick(["BROKEN", "SEVERELY_OUTDATED", "POOR", "AVERAGE", "GOOD", "EXCELLENT"]) },
    { group: t("review.groupOther"), options: pick(["NOT_CHECKED"]) },
  ];
}
const HAS_SITE = new Set(["BROKEN", "SEVERELY_OUTDATED", "POOR", "AVERAGE", "GOOD", "EXCELLENT"]);

const AUTOSAVE_MS = 1000;
type SaveStatus = "saved" | "dirty" | "saving" | "error";

/**
 * Guided single-business review (spec §23–27). Mount with `key={business.id}` so the form resets
 * per business. `nav` renders queue navigation above the header.
 */
export default function ReviewWorkspace({
  business: b,
  onDecided,
  nav,
}: {
  business: BusinessDetail;
  onDecided?: (b: BusinessDetail) => void;
  nav?: ReactNode;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Review>(() => toForm(b));
  const [status, setStatus] = useState<SaveStatus>("saved");
  const formRef = useRef(form);
  formRef.current = form;

  const save = useMutation({
    mutationFn: (review: Review) => api.saveReview(b.id, review),
    onSuccess: (saved) => {
      qc.setQueryData(["business", saved.id], saved);
      qc.invalidateQueries({ queryKey: ["businesses"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
    },
  });

  const flush = useCallback(async () => {
    setStatus("saving");
    try {
      await save.mutateAsync(formRef.current);
      setStatus((s) => (s === "saving" ? "saved" : s));
    } catch {
      setStatus("error");
      throw new Error("Could not save review");
    }
  }, [save]);

  // Debounced autosave whenever the form changes.
  useEffect(() => {
    if (status !== "dirty") return;
    const t = setTimeout(() => void flush().catch(() => {}), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [form, status, flush]);

  const update = <K extends keyof Review>(key: K, value: Review[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setStatus("dirty");
  };
  const text = (key: keyof Review) => ({
    value: (form[key] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(key, e.target.value as never),
  });

  const { t } = useI18n();
  const L = useLabels();
  const sectorName = useSectorName();
  const placeName = usePlaceName();
  const actions = useBusinessActions(onDecided);
  // Decisions always persist pending checklist/notes edits first.
  const decide = async (fn: () => void) => {
    if (status === "dirty" || status === "error") await flush();
    fn();
  };
  const actionError = actions.reject.error ?? actions.favorite.error ?? actions.approve.error ?? actions.restore.error;
  const decided = b.record_state === "REJECTED" || b.record_state === "APPROVED";
  const showBrand = form.rebrand_status === "POSSIBLE" || form.rebrand_status === "CONFIRMED" || !!form.current_brand_name;

  return (
    <div className="flex flex-col gap-6">
      {nav}

      {/* Header */}
      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className={`text-[26px] leading-tight font-semibold tracking-tight ${b.name ? "" : "text-muted italic"}`}>{displayName(b)}</h1>
            <p className="mt-1 text-[15px] text-muted">
              {b.sector ? sectorName(b.sector.name) : t("common.noSector")} · {placeName(b.location?.name) || "—"}
              {b.address_text ? ` · ${b.address_text}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {b.favorite && (
              <Badge tone="amber">
                <Heart className="h-3 w-3 fill-current" /> {t("review.favoriteBadge")}
              </Badge>
            )}
            <StateBadge state={b.record_state} />
          </div>
        </div>
        {b.record_state === "REJECTED" && (
          <p className="rounded-[var(--radius-control)] bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {t("review.rejectedNotice", { reason: labelOf(L.REJECT_REASONS, b.reject_reason), note: b.reject_note ? ` — ${b.reject_note}` : "" })}
          </p>
        )}
        <QuickLinks business={b} website={form.manual_website} size="md" />
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <FactsPanel business={b} form={form} />

        <div className="flex min-w-0 flex-col gap-6 xl:order-first">
          <Section n={1} title={t("review.s1")} description={t("review.s1Hint")}>
            <Question label={t("review.qActive")}>
              <Segmented ariaLabel={t("review.aActive")} options={L.BUSINESS_ACTIVE} value={form.business_active} onChange={(v) => update("business_active", v)} />
            </Question>
            <Question label={t("review.qRebrand")}>
              <Segmented ariaLabel={t("review.aRebrand")} options={L.REBRAND_STATUS} value={form.rebrand_status} onChange={(v) => update("rebrand_status", v)} />
            </Question>
            {showBrand && (
              <Question label={t("review.qBrand")}>
                <input className="control max-w-md" placeholder={t("review.brandPlaceholder")} {...text("current_brand_name")} />
              </Question>
            )}
          </Section>

          <Section n={2} title={t("review.s2")} description={t("review.s2Hint")}>
            <Question label={t("review.qWebsiteStatus")}>
              <SelectInput
                className="max-w-md"
                ariaLabel={t("review.qWebsiteStatus")}
                value={form.verified_website_status ?? ""}
                onChange={(v) => update("verified_website_status", v || null)}
                placeholder={t("review.notCheckedYet")}
                options={websiteStatusGroups(L, t)}
              />
            </Question>
            <Disclosure
              key={HAS_SITE.has(form.verified_website_status ?? "") ? "open" : "closed"}
              defaultOpen={HAS_SITE.has(form.verified_website_status ?? "") || form.website_issues.length > 0}
              summary={
                <span>
                  {t("review.issues")}
                  {form.website_issues.length > 0 && <span className="ml-2 text-muted">{t("review.selected", { count: form.website_issues.length })}</span>}
                </span>
              }
            >
              <CheckboxGrid options={L.WEBSITE_ISSUES} value={form.website_issues} onChange={(v) => update("website_issues", v)} />
            </Disclosure>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Question label={t("review.qVerifiedWebsite")}>
                <input className="control" placeholder="https://…" {...text("manual_website")} />
              </Question>
              <Question label={t("review.qVerifiedInstagram")}>
                <input className="control" placeholder={t("review.instagramPlaceholder")} {...text("manual_instagram")} />
              </Question>
            </div>
            <Question label={t("review.qInstagram")}>
              <Segmented ariaLabel={t("review.qInstagram")} options={L.INSTAGRAM_STATUS} value={form.instagram_status} onChange={(v) => update("instagram_status", v)} />
            </Question>
          </Section>

          <Section n={3} title={t("review.s3")} description={t("review.s3Hint")}>
            <Question label={t("review.qReach")}>
              <ToggleChips ariaLabel={t("review.aReach")} options={L.REACHABILITY} value={form.reachability} onChange={(v) => update("reachability", v)} />
            </Question>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Question label={t("review.qVerifiedPhone")}>
                <input className="control" placeholder="+90 …" {...text("manual_phone")} />
              </Question>
              <Question label={t("review.qVerifiedEmail")}>
                <input className="control" placeholder="name@…" {...text("manual_email")} />
              </Question>
            </div>
            <Question label={t("review.qWebsiteValue")}>
              <Segmented ariaLabel={t("review.aWebsiteValue")} options={L.COMMERCIAL_VALUE} value={form.commercial_value} onChange={(v) => update("commercial_value", v)} />
            </Question>
            <Question label={t("review.qCustomerValue")}>
              <Segmented ariaLabel={t("review.aCustomerValue")} options={L.CUSTOMER_VALUE} value={form.customer_value} onChange={(v) => update("customer_value", v)} />
            </Question>
          </Section>

          <Section n={4} title={t("review.s4")}>
            <Question label={t("review.notes")} hint={t("review.notesHint")}>
              <textarea className="control min-h-48 text-[15px]" aria-label={t("review.notes")} {...text("notes")} />
            </Question>
            <Question label={t("review.qContact")}>
              <Segmented ariaLabel={t("review.aContact")} options={L.CONTACT_DECISION} value={form.contact_decision} onChange={(v) => update("contact_decision", v)} />
            </Question>
          </Section>
        </div>
      </div>

      {/* Decision bar: in normal flow at the end, sticky while scrolling — it never hides the last fields. */}
      <div className="sticky bottom-4 z-20 mt-2">
        <div className="card flex flex-wrap items-center gap-3 p-2.5 shadow-[var(--shadow-raised)] sm:p-3 sm:px-4">
          <SaveIndicator status={status} onRetry={() => void flush().catch(() => {})} />
          {/* Narrow screens: one row of equal buttons. Wider: right-aligned, Approve dominant. */}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
            {!decided ? (
              <>
                <RejectControl size="lg" placement="top" align="left" pending={actions.reject.isPending} onReject={(reason, note) => decide(() => actions.reject.mutate({ id: b.id, reason, note }))} />
                <Button variant="secondary" size="lg" aria-pressed={b.favorite} disabled={actions.favorite.isPending} onClick={() => decide(() => actions.favorite.mutate({ id: b.id, favorite: !b.favorite }))}>
                  <Heart className={`h-4 w-4 ${b.favorite ? "fill-amber-400 text-amber-500" : ""}`} />
                  {b.favorite ? t("review.unfavorite") : t("review.favorite")}
                </Button>
                <Button variant="primary" size="lg" className="sm:min-w-36" disabled={actions.approve.isPending} onClick={() => decide(() => actions.approve.mutate(b.id))}>
                  <Check className="h-4 w-4" strokeWidth={2.5} /> {t("review.approve")}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="lg" disabled={actions.restore.isPending} onClick={() => actions.restore.mutate(b.id)}>
                  <Undo2 className="h-4 w-4" /> {b.record_state === "REJECTED" ? t("common.undoReject") : t("common.undoApproval")}
                </Button>
                {b.record_state === "APPROVED" && b.lead_record_id && (
                  <ButtonLink to={`/leads/${b.lead_record_id}`} variant="primary" size="lg">
                    {t("common.openLead")} <ArrowRight className="h-4 w-4" />
                  </ButtonLink>
                )}
              </>
            )}
          </div>
          {(actionError || save.error) && (
            <div className="w-full">
              <ErrorNote error={actionError ?? save.error} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, description, children }: { n: number; title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-ink">{n}</span>
        <div>
          <h2 className="text-[17px] font-semibold">{title}</h2>
          {description && <p className="t-caption mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </Card>
  );
}

function Question({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="t-label text-[14px]">{label}</span>
      {children}
      {hint && <span className="t-caption">{hint}</span>}
    </div>
  );
}

/** OSM facts beside the user's verified values (spec §25: "OSM data" vs "Verified by me"). */
function FactsPanel({ business: b, form }: { business: BusinessDetail; form: Review }) {
  const { t } = useI18n();
  const L = useLabels();
  const rows: { label: string; osm: string | null; href?: string | null; verified?: string | null; note?: ReactNode }[] = [
    {
      label: t("common.website"),
      osm: b.website,
      href: externalUrl(b.website),
      verified: form.manual_website,
      note: b.website && b.normalized_website_type !== "OWN_WEBSITE" ? labelOf(L.WEBSITE_TYPES, b.normalized_website_type) : null,
    },
    { label: t("common.phone"), osm: b.phone, verified: form.manual_phone },
    { label: t("common.email"), osm: b.email, verified: form.manual_email },
    { label: "Instagram", osm: b.osm_instagram, verified: form.manual_instagram },
    { label: t("review.openingHours"), osm: b.opening_hours },
  ];
  return (
    <aside className="xl:sticky xl:top-6 xl:self-start">
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="t-section">{t("review.facts")}</h2>
          <p className="t-caption mt-0.5">{t("review.factsHint")}</p>
        </div>
        <dl className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-0.5 text-sm">
              <dt className="t-caption">{r.label}</dt>
              <dd className="flex flex-col gap-1">
                <span>
                  <OsmValue value={r.osm} href={r.href} unknownLabel={t("review.unknownNotInOsm")} />
                  {r.note && <Badge tone="amber" className="ml-2">{r.note}</Badge>}
                </span>
                {r.verified && (
                  <span className="flex items-start gap-1.5 text-emerald-700">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span className="break-all">{r.verified}</span>
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-1 border-t border-line-soft pt-3 text-[13px] text-muted">
          <a className="text-accent-ink hover:underline" href={b.osm_url} target="_blank" rel="noreferrer">
            {t("review.osmRecord", { ref: `${b.osm_type}/${b.osm_id}` })} ↗
          </a>
          <span>
            {t("review.firstSeen", { date: fmtDate(b.first_seen_at), count: b.times_seen })}
          </span>
        </div>
        <Disclosure summary={<span className="text-[13px]">{t("review.allTags", { count: Object.keys(b.raw_tags).length })}</span>}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-xs">
            {Object.entries(b.raw_tags).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      </Card>
    </aside>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const { t } = useI18n();
  const map: Record<SaveStatus, [string, string]> = {
    saved: [t("save.saved"), "bg-emerald-500"],
    dirty: [t("save.editing"), "bg-amber-400"],
    saving: [t("save.saving"), "bg-zinc-400"],
    error: [t("save.notSaved"), "bg-rose-500"],
  };
  const [label, dot] = map[status];
  return (
    <span className="flex items-center gap-2 text-[13px] text-muted" aria-live="polite" title={label}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="sr-only sm:not-sr-only">{label}</span>
      {status === "error" && (
        <button type="button" className="font-medium text-accent-ink hover:underline" onClick={onRetry}>
          {t("save.retry")}
        </button>
      )}
    </span>
  );
}
