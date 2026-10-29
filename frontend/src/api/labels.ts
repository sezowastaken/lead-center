// Display labels for backend enum values (spec §24, §27), translated through the i18n dictionaries.

import { useMemo } from "react";
import { useI18n, type MessageKey, type T } from "../i18n";

export type Option = { value: string; label: string };

/** Enum values per group; their labels live in the dictionaries under `enum.<group>.<VALUE>`. */
export const ENUM_VALUES = {
  reject: ["GOOD_WEBSITE", "BUSINESS_CLOSED", "REBRANDED", "WEBSITE_NOT_USEFUL", "TOO_LOW_VALUE", "UNREACHABLE", "WRONG_SECTOR", "LOW_QUALITY_BUSINESS", "DUPLICATE", "OTHER"],
  active: ["YES", "NO", "UNCERTAIN"],
  rebrand: ["NO", "POSSIBLE", "CONFIRMED"],
  website: ["NOT_CHECKED", "NO_INDEPENDENT_WEBSITE", "SOCIAL_ONLY", "THIRD_PARTY_ONLY", "BROKEN", "SEVERELY_OUTDATED", "POOR", "AVERAGE", "GOOD", "EXCELLENT"],
  issue: [
    "OLD_DESIGN", "POOR_MOBILE", "SLOW", "BROKEN_LINKS", "BROKEN_ELEMENTS", "MISSING_CTA", "WEAK_CONTACT_FLOW",
    "WEAK_SERVICE_PRESENTATION", "CONFUSING_NAVIGATION", "POOR_VISUAL_TRUST", "OLD_CONTENT", "BROKEN_BOOKING", "NO_ENGLISH", "OTHER",
  ],
  instagram: ["ACTIVE", "INACTIVE", "NOT_FOUND", "NOT_CHECKED"],
  reach: ["WHATSAPP", "PHONE", "INSTAGRAM_DM", "EMAIL", "WEBSITE_FORM", "IN_PERSON"],
  commercial: ["HIGH", "MEDIUM", "LOW", "UNCLEAR"],
  customer: ["HIGH", "MEDIUM", "LOW", "UNKNOWN"],
  contact: ["YES", "MAYBE", "NO"],
  websiteType: ["UNKNOWN", "OWN_WEBSITE", "SOCIAL_ONLY", "WHATSAPP_ONLY", "THIRD_PARTY_BOOKING", "MARKETPLACE_PROFILE", "BROKEN_OR_INVALID"],
  stateView: ["queue", "active", "decided", "DISCOVERED", "IN_REVIEW", "FAVORITED", "APPROVED", "REJECTED", "all"],
  state: ["DISCOVERED", "IN_REVIEW", "FAVORITED", "APPROVED", "REJECTED"],
  stage: ["READY_TO_CONTACT", "CONTACTED", "NO_RESPONSE", "REPLIED", "FOLLOW_UP", "MEETING", "OFFER_SENT", "WON", "LOST"],
  channel: ["WHATSAPP", "PHONE", "INSTAGRAM_DM", "EMAIL", "WEBSITE_FORM", "IN_PERSON"],
  eventType: ["OUTBOUND", "INBOUND", "NOTE"],
  event: ["OUTBOUND", "INBOUND", "NOTE", "STAGE_CHANGE"],
  priority: ["HIGH", "MEDIUM_HIGH", "MEDIUM", "MIXED", "LOW"],
  coverage: ["EXCELLENT", "GOOD", "MEDIUM", "LOW", "VERY_LOW", "NONE"],
} as const;

export type EnumGroup = keyof typeof ENUM_VALUES;

export function enumKey(group: EnumGroup, value: string): MessageKey {
  return `enum.${group}.${value}` as MessageKey;
}

function options(t: T, group: EnumGroup): Option[] {
  return ENUM_VALUES[group].map((value) => ({ value, label: t(enumKey(group, value)) }));
}

export function buildLabels(t: T) {
  return {
    REJECT_REASONS: options(t, "reject"),
    BUSINESS_ACTIVE: options(t, "active"),
    REBRAND_STATUS: options(t, "rebrand"),
    VERIFIED_WEBSITE_STATUS: options(t, "website"),
    WEBSITE_ISSUES: options(t, "issue"),
    INSTAGRAM_STATUS: options(t, "instagram"),
    REACHABILITY: options(t, "reach"),
    COMMERCIAL_VALUE: options(t, "commercial"),
    CUSTOMER_VALUE: options(t, "customer"),
    CONTACT_DECISION: options(t, "contact"),
    WEBSITE_TYPES: options(t, "websiteType"),
    STATE_VIEWS: options(t, "stateView"),
    CRM_STAGES: options(t, "stage"),
    CONTACT_CHANNELS: options(t, "channel"),
    EVENT_TYPES: options(t, "eventType"),
    PRIORITIES: options(t, "priority"),
    COVERAGES: options(t, "coverage"),
    /** Short state badge text, e.g. DISCOVERED -> "New". */
    state: (value: string) => t(enumKey("state", value)),
    /** Timeline badge text for an outreach event type. */
    event: (value: string) => t(enumKey("event", value)),
  };
}

export type Labels = ReturnType<typeof buildLabels>;

export function useLabels(): Labels {
  const { t, lang } = useI18n();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildLabels(t), [lang]);
}

export function labelOf(options: Option[], value: string | null | undefined): string {
  return options.find((o) => o.value === value)?.label ?? value ?? "";
}
