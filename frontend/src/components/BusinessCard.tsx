import { ArrowRight, Globe, Heart, MoreHorizontal, Phone } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useBusinessActions } from "../api/hooks";
import { labelOf, useLabels } from "../api/labels";
import { displayName, externalUrl } from "../api/links";
import type { Business } from "../api/types";
import { useI18n, usePlaceName, useSectorName } from "../i18n";
import QuickLinks from "./QuickLinks";
import RejectControl from "./RejectControl";
import { Badge, Button, ButtonLink, ErrorNote, Popover, StateBadge } from "./ui";

function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Market card (spec §22): name and signals first, technical OSM details live on the review page. */
export default function BusinessCard({ business: b }: { business: Business }) {
  const { t } = useI18n();
  const L = useLabels();
  const sector = useSectorName();
  const placeName = usePlaceName();
  const actions = useBusinessActions();
  const [menu, setMenu] = useState(false);
  const decided = b.record_state === "REJECTED" || b.record_state === "APPROVED";
  const error = actions.reject.error ?? actions.favorite.error ?? actions.approve.error ?? actions.restore.error;

  return (
    <article className="card flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/business/${b.id}`} className={`block text-[17px] leading-snug font-semibold hover:underline ${b.name ? "" : "text-muted italic"}`}>
            {displayName(b)}
          </Link>
          <p className="mt-0.5 text-sm text-muted">
            {b.sector ? sector(b.sector.name) : t("common.noSector")} · {placeName(b.location?.name) || "—"}
          </p>
        </div>
        {b.record_state !== "DISCOVERED" && <StateBadge state={b.record_state} />}
      </header>

      <dl className="flex flex-col gap-2 text-[15px]">
        <div className="flex items-center gap-2.5">
          <Globe className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <dt className="sr-only">{t("common.website")}</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-2">
            {b.website ? (
              <a href={externalUrl(b.website)!} target="_blank" rel="noreferrer" className="truncate text-ink-2 hover:text-accent-ink hover:underline">
                {hostOf(b.website)}
              </a>
            ) : (
              <span className="text-muted" title={t("card.websiteUnknownHint")}>
                {t("card.websiteUnknown")}
              </span>
            )}
            {b.website && b.normalized_website_type !== "OWN_WEBSITE" && <Badge tone="amber">{labelOf(L.WEBSITE_TYPES, b.normalized_website_type)}</Badge>}
          </dd>
        </div>
        <div className="flex items-center gap-2.5">
          <Phone className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <dt className="sr-only">{t("common.phone")}</dt>
          <dd className={b.phone ? "text-ink-2" : "text-muted"}>{b.phone ?? t("card.phoneUnknown")}</dd>
        </div>
        {b.record_state === "REJECTED" && (
          <p className="text-sm text-rose-700">
            {t("card.rejectedReason", { reason: labelOf(L.REJECT_REASONS, b.reject_reason) })}
            {b.reject_note ? ` — ${b.reject_note}` : ""}
          </p>
        )}
      </dl>

      <QuickLinks business={b} />

      <footer className="mt-auto flex items-center gap-2 border-t border-line-soft pt-4">
        {b.record_state === "APPROVED" && b.lead_record_id ? (
          <ButtonLink to={`/leads/${b.lead_record_id}`} variant="primary">
            {t("common.openLead")} <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        ) : (
          <ButtonLink to={`/business/${b.id}`} variant="primary">
            {t("card.review")} <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        )}
        {!decided && (
          <>
            <Button
              variant="secondary"
              size="icon"
              aria-pressed={b.favorite}
              aria-label={b.favorite ? t("card.unfavorite") : t("card.favorite")}
              title={b.favorite ? t("card.unfavorite") : t("card.favorite")}
              onClick={() => actions.favorite.mutate({ id: b.id, favorite: !b.favorite })}
              disabled={actions.favorite.isPending}
            >
              <Heart className={`h-4 w-4 ${b.favorite ? "fill-amber-400 text-amber-500" : ""}`} />
            </Button>
            <RejectControl size="md" align="left" pending={actions.reject.isPending} onReject={(reason, note) => actions.reject.mutate({ id: b.id, reason, note })} />
          </>
        )}
        <div className="relative ml-auto">
          <Button variant="ghost" size="icon" aria-label={t("card.moreActions")} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          <Popover open={menu} onClose={() => setMenu(false)} align="right" placement="top">
            <div className="flex flex-col text-sm">
              {!decided && (
                <button type="button" className="rounded-md px-2 py-1.5 text-left hover:bg-hover" onClick={() => (actions.approve.mutate(b.id), setMenu(false))}>
                  {t("card.approveWithoutReview")}
                </button>
              )}
              {decided && (
                <button type="button" className="rounded-md px-2 py-1.5 text-left hover:bg-hover" onClick={() => (actions.restore.mutate(b.id), setMenu(false))}>
                  {b.record_state === "REJECTED" ? t("common.undoReject") : t("common.undoApproval")}
                </button>
              )}
              <a className="rounded-md px-2 py-1.5 hover:bg-hover" href={b.osm_url} target="_blank" rel="noreferrer">
                {t("card.openOsm")}
              </a>
              <span className="px-2 pt-1.5 text-xs text-muted">
                {t("card.seenIn", { count: b.times_seen })}
              </span>
            </div>
          </Popover>
        </div>
      </footer>
      <ErrorNote error={error} />
    </article>
  );
}
