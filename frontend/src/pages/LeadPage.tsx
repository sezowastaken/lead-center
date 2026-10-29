import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { fmtDateTime, fmtMoney } from "../api/format";
import { labelOf, useLabels } from "../api/labels";
import { externalUrl } from "../api/links";
import type { LeadDetail, LeadFields } from "../api/types";
import { useI18n, useSectorName } from "../i18n";
import QuickLinks from "../components/QuickLinks";
import { Badge, Button, ButtonLink, Card, CardHeader, ErrorNote, Field, OsmValue, Segmented, SelectInput, StageBadge } from "../components/ui";
import { suggestStage } from "../lib/logic";

export default function LeadPage() {
  const { t } = useI18n();
  const id = Number(useParams().id);
  const query = useQuery({ queryKey: ["lead", id], queryFn: () => api.lead(id) });
  return (
    <div className="flex flex-col gap-6">
      <div>
        <ButtonLink to="/leads" variant="ghost">
          <ChevronLeft className="h-4 w-4" /> {t("nav.leads")}
        </ButtonLink>
      </div>
      <ErrorNote error={query.error} />
      {query.isLoading && <p className="t-caption">{t("common.loading")}</p>}
      {query.data && <LeadView key={query.data.id} lead={query.data} />}
    </div>
  );
}

function useLeadSettle() {
  const qc = useQueryClient();
  return (l: LeadDetail) => {
    qc.setQueryData(["lead", l.id], l);
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

function LeadView({ lead }: { lead: LeadDetail }) {
  const { t } = useI18n();
  const L = useLabels();
  const sectorName = useSectorName();
  const settle = useLeadSettle();
  const stage = useMutation({ mutationFn: (s: string) => api.changeStage(lead.id, s), onSuccess: settle });
  const b = lead.business;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{lead.display_name ?? t("common.unnamed")}</h1>
            <p className="mt-1 text-[15px] text-muted">
              {sectorName(b.sector?.name)} · {b.location?.name} · {t("lead.approvedOn", { date: fmtDateTime(lead.created_at) })}
              {lead.display_name !== b.name && b.name ? ` · ${t("lead.osmName", { name: b.name })}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StageBadge stage={lead.stage} label={labelOf(L.CRM_STAGES, lead.stage)} />
            <ButtonLink to={`/business/${b.id}`} variant="secondary" size="sm">
              {t("lead.reviewNotes")}
            </ButtonLink>
          </div>
        </div>
        <QuickLinks business={b} website={lead.contact_website} size="md" />
        <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
          <span className="t-label">{t("lead.pipelineStage")}</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("lead.pipelineStage")}>
            {L.CRM_STAGES.map((s) => {
              const active = s.value === lead.stage;
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={stage.isPending}
                  onClick={() => !active && stage.mutate(s.value)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    active ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink-2 hover:border-zinc-300 hover:text-ink"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <ErrorNote error={stage.error} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <LogOutreach lead={lead} />
          <Timeline lead={lead} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <ContactCard lead={lead} />
          <LeadFieldsForm lead={lead} />
        </div>
      </div>
    </div>
  );
}

function ContactCard({ lead }: { lead: LeadDetail }) {
  const { t } = useI18n();
  const b = lead.business;
  const row = (label: string, value: string | null, osm: string | null, href?: string | null) => (
    <div className="flex flex-col gap-0.5 text-sm">
      <dt className="t-caption">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2">
        <OsmValue value={value} href={href} />
        {value && value !== osm && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("lead.verifiedByMe")}
          </span>
        )}
      </dd>
    </div>
  );
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader title={t("lead.contact")} />
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {row(t("common.phone"), lead.contact_phone, b.phone)}
        {row(t("common.website"), lead.contact_website, b.website, externalUrl(lead.contact_website))}
        {row("Instagram", lead.contact_instagram, b.osm_instagram)}
        {row(t("common.email"), lead.contact_email, b.email)}
        <div className="flex flex-col gap-0.5 text-sm">
          <dt className="t-caption">{t("lead.firstContact")}</dt>
          <dd>{fmtDateTime(lead.first_contact_at)}</dd>
        </div>
        <div className="flex flex-col gap-0.5 text-sm">
          <dt className="t-caption">{t("leads.lastContact")}</dt>
          <dd>{fmtDateTime(lead.last_contact_at)}</dd>
        </div>
      </dl>
    </Card>
  );
}

const fieldsOf = (l: LeadDetail): LeadFields => ({
  preferred_contact_channel: l.preferred_contact_channel,
  personalized_angle: l.personalized_angle,
  message_draft: l.message_draft,
  estimated_scope: l.estimated_scope,
  quoted_price: l.quoted_price,
  next_follow_up_at: l.next_follow_up_at,
  won_value: l.won_value,
  lost_reason: l.lost_reason,
});

function LeadFieldsForm({ lead }: { lead: LeadDetail }) {
  const settle = useLeadSettle();
  const [form, setForm] = useState<LeadFields>(() => fieldsOf(lead));
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const save = useMutation({
    mutationFn: () => api.updateLead(lead.id, form),
    onSuccess: (l) => {
      settle(l);
      setDirty(false);
    },
  });
  const set = <K extends keyof LeadFields>(k: K, v: LeadFields[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const { t } = useI18n();
  const L = useLabels();
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const copyDraft = async () => {
    await navigator.clipboard.writeText(form.message_draft ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <CardHeader title={t("lead.plan")} description={t("lead.planHint")} />
      <Field label={t("lead.preferredChannel")}>
        <Segmented ariaLabel={t("lead.preferredChannel")} options={L.CONTACT_CHANNELS} value={form.preferred_contact_channel} onChange={(v) => set("preferred_contact_channel", v)} />
      </Field>
      <Field label={t("lead.angle")}>
        <textarea className="control min-h-20" value={form.personalized_angle ?? ""} onChange={(e) => set("personalized_angle", e.target.value)} placeholder={t("lead.anglePlaceholder")} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="t-label">{t("lead.draft")}</span>
          <Button variant="ghost" size="sm" onClick={copyDraft} disabled={!form.message_draft}>
            <Copy className="h-3.5 w-3.5" /> {copied ? t("lead.copied") : t("lead.copy")}
          </Button>
        </div>
        <textarea
          className="control min-h-32"
          aria-label={t("lead.draft")}
          value={form.message_draft ?? ""}
          onChange={(e) => set("message_draft", e.target.value)}
          placeholder={t("lead.draftPlaceholder")}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("lead.nextFollowUp")}>
          <input className="control" type="date" value={form.next_follow_up_at ?? ""} onChange={(e) => set("next_follow_up_at", e.target.value || null)} />
        </Field>
        <Field label={t("lead.scope")}>
          <input className="control" value={form.estimated_scope ?? ""} onChange={(e) => set("estimated_scope", e.target.value)} />
        </Field>
        <Field label={t("lead.quoted")}>
          <input className="control" type="number" min={0} value={form.quoted_price ?? ""} onChange={(e) => set("quoted_price", num(e.target.value))} />
        </Field>
        <Field label={t("lead.wonValue")}>
          <input className="control" type="number" min={0} value={form.won_value ?? ""} onChange={(e) => set("won_value", num(e.target.value))} />
        </Field>
        <Field label={t("lead.lostReason")} className="sm:col-span-2">
          <input className="control" value={form.lost_reason ?? ""} onChange={(e) => set("lost_reason", e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t("save.saving") : t("common.save")}
        </Button>
        <span className={`text-[13px] ${dirty ? "text-amber-700" : "text-muted"}`}>{dirty ? t("lead.unsaved") : t("lead.allSaved")}</span>
        {lead.quoted_price != null && <span className="ml-auto t-caption">{t("lead.quotedShort", { amount: fmtMoney(lead.quoted_price) })}</span>}
      </div>
      <ErrorNote error={save.error} />
    </Card>
  );
}

function LogOutreach({ lead }: { lead: LeadDetail }) {
  const { t } = useI18n();
  const L = useLabels();
  const settle = useLeadSettle();
  const [eventType, setEventType] = useState("OUTBOUND");
  const [channel, setChannel] = useState<string | null>(lead.preferred_contact_channel);
  const [message, setMessage] = useState("");
  const [when, setWhen] = useState("");
  const [newStage, setNewStage] = useState(suggestStage("OUTBOUND", lead.stage));
  // Re-suggest when the stage changes elsewhere on the page.
  useEffect(() => setNewStage(suggestStage(eventType, lead.stage)), [lead.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = useMutation({
    mutationFn: () =>
      api.addEvent(lead.id, {
        event_type: eventType,
        channel: eventType === "NOTE" ? null : channel,
        message_or_note: message || null,
        event_at: when ? new Date(when).toISOString() : null,
        new_stage: newStage || null,
      }),
    onSuccess: (l) => {
      settle(l);
      setMessage("");
      setWhen("");
      setNewStage(suggestStage(eventType, l.stage));
    },
  });

  const chooseType = (t: string | null) => {
    const type = t ?? "OUTBOUND";
    setEventType(type);
    setNewStage(suggestStage(type, lead.stage));
  };

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <CardHeader title={t("lead.log")} description={t("lead.logHint")} />
      <Field label={t("lead.whatHappened")}>
        <Segmented ariaLabel={t("lead.whatHappened")} options={L.EVENT_TYPES} value={eventType} onChange={chooseType} />
      </Field>
      {eventType !== "NOTE" && (
        <Field label={t("leads.channel")}>
          <Segmented ariaLabel={t("leads.channel")} options={L.CONTACT_CHANNELS} value={channel} onChange={setChannel} />
        </Field>
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="t-label">{eventType === "OUTBOUND" ? t("lead.exactMessage") : eventType === "INBOUND" ? t("lead.theirReply") : t("lead.note")}</span>
          {eventType === "OUTBOUND" && lead.message_draft && (
            <Button variant="ghost" size="sm" onClick={() => setMessage(lead.message_draft ?? "")}>
              {t("lead.useDraft")}
            </Button>
          )}
        </div>
        <textarea className="control min-h-28" aria-label={t("lead.message")} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("lead.when")} hint={t("lead.whenHint")}>
          <input className="control" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label={t("lead.alsoMove")}>
          <SelectInput
            value={newStage}
            onChange={setNewStage}
            placeholder={t("lead.keepStage", { stage: labelOf(L.CRM_STAGES, lead.stage) })}
            options={L.CRM_STAGES.filter((s) => s.value !== lead.stage)}
          />
        </Field>
      </div>
      <div>
        <Button variant="primary" disabled={add.isPending || (eventType === "NOTE" && !message.trim())} onClick={() => add.mutate()}>
          {add.isPending ? t("save.saving") : t("lead.addToHistory")}
        </Button>
      </div>
      <ErrorNote error={add.error} />
    </Card>
  );
}

function Timeline({ lead }: { lead: LeadDetail }) {
  const { t } = useI18n();
  const L = useLabels();
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader title={t("lead.history", { count: lead.events.length })} />
      {lead.events.length === 0 && <p className="t-caption">{t("lead.nothingYet")}</p>}
      <ol className="flex flex-col">
        {lead.events.map((e) => (
          <li key={e.id} className="relative border-l border-line py-2.5 pl-4">
            <span className={`absolute top-4 -left-[4.5px] h-2 w-2 rounded-full ${e.event_type === "STAGE_CHANGE" ? "bg-zinc-300" : "bg-accent"}`} />
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-muted">{fmtDateTime(e.event_at)}</span>
              <Badge tone={e.event_type === "INBOUND" ? "green" : e.event_type === "OUTBOUND" ? "accent" : "neutral"}>{L.event(e.event_type)}</Badge>
              {e.channel && <span className="text-muted">{labelOf(L.CONTACT_CHANNELS, e.channel)}</span>}
              {e.event_type === "STAGE_CHANGE" && (
                <span className="text-ink-2">
                  {labelOf(L.CRM_STAGES, e.stage_from)} → <strong className="font-medium">{labelOf(L.CRM_STAGES, e.stage_to)}</strong>
                </span>
              )}
            </div>
            {e.message_or_note && <p className="mt-1 text-[15px] whitespace-pre-wrap text-ink">{e.message_or_note}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
