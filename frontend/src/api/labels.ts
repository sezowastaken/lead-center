// Display labels for backend enum values (spec §24, §27).

export type Option = { value: string; label: string };

export const REJECT_REASONS: Option[] = [
  { value: "GOOD_WEBSITE", label: "Already has a good website" },
  { value: "BUSINESS_CLOSED", label: "Business closed" },
  { value: "REBRANDED", label: "Rebranded" },
  { value: "WEBSITE_NOT_USEFUL", label: "Website wouldn't help them" },
  { value: "TOO_LOW_VALUE", label: "Too low value" },
  { value: "UNREACHABLE", label: "Unreachable" },
  { value: "WRONG_SECTOR", label: "Wrong sector" },
  { value: "LOW_QUALITY_BUSINESS", label: "Low quality business" },
  { value: "DUPLICATE", label: "Duplicate" },
  { value: "OTHER", label: "Other" },
];

export const BUSINESS_ACTIVE: Option[] = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "UNCERTAIN", label: "Uncertain" },
];

export const REBRAND_STATUS: Option[] = [
  { value: "NO", label: "No" },
  { value: "POSSIBLE", label: "Possible" },
  { value: "CONFIRMED", label: "Confirmed" },
];

export const VERIFIED_WEBSITE_STATUS: Option[] = [
  { value: "NOT_CHECKED", label: "Not checked" },
  { value: "NO_INDEPENDENT_WEBSITE", label: "No independent website" },
  { value: "SOCIAL_ONLY", label: "Social media only" },
  { value: "THIRD_PARTY_ONLY", label: "Third-party booking/profile only" },
  { value: "BROKEN", label: "Website broken" },
  { value: "SEVERELY_OUTDATED", label: "Severely outdated" },
  { value: "POOR", label: "Poor" },
  { value: "AVERAGE", label: "Average" },
  { value: "GOOD", label: "Good" },
  { value: "EXCELLENT", label: "Excellent" },
];

export const WEBSITE_ISSUES: Option[] = [
  { value: "OLD_DESIGN", label: "Old design" },
  { value: "POOR_MOBILE", label: "Poor mobile experience" },
  { value: "SLOW", label: "Slow" },
  { value: "BROKEN_LINKS", label: "Broken links" },
  { value: "BROKEN_ELEMENTS", label: "Broken elements" },
  { value: "MISSING_CTA", label: "Missing CTA" },
  { value: "WEAK_CONTACT_FLOW", label: "Weak WhatsApp/contact flow" },
  { value: "WEAK_SERVICE_PRESENTATION", label: "Weak service presentation" },
  { value: "CONFUSING_NAVIGATION", label: "Confusing navigation" },
  { value: "POOR_VISUAL_TRUST", label: "Poor visual trust" },
  { value: "OLD_CONTENT", label: "Old content" },
  { value: "BROKEN_BOOKING", label: "Broken booking flow" },
  { value: "NO_ENGLISH", label: "No English option where valuable" },
  { value: "OTHER", label: "Other" },
];

export const INSTAGRAM_STATUS: Option[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "NOT_FOUND", label: "Not found" },
  { value: "NOT_CHECKED", label: "Not checked" },
];

export const REACHABILITY: Option[] = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "PHONE", label: "Phone" },
  { value: "INSTAGRAM_DM", label: "Instagram DM" },
  { value: "EMAIL", label: "Email" },
  { value: "WEBSITE_FORM", label: "Website contact form" },
  { value: "IN_PERSON", label: "In-person" },
];

export const COMMERCIAL_VALUE: Option[] = [
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "UNCLEAR", label: "Unclear" },
];

export const CUSTOMER_VALUE: Option[] = [
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "UNKNOWN", label: "Unknown" },
];

export const CONTACT_DECISION: Option[] = [
  { value: "YES", label: "Yes" },
  { value: "MAYBE", label: "Maybe" },
  { value: "NO", label: "No" },
];

export const WEBSITE_TYPES: Option[] = [
  { value: "UNKNOWN", label: "Unknown (not in OSM)" },
  { value: "OWN_WEBSITE", label: "Own website" },
  { value: "SOCIAL_ONLY", label: "Social only" },
  { value: "WHATSAPP_ONLY", label: "WhatsApp only" },
  { value: "THIRD_PARTY_BOOKING", label: "Third-party booking" },
  { value: "MARKETPLACE_PROFILE", label: "Marketplace profile" },
  { value: "BROKEN_OR_INVALID", label: "Broken / invalid" },
];

export const STATE_VIEWS: Option[] = [
  { value: "queue", label: "Review queue (new + in review)" },
  { value: "active", label: "All except rejected" },
  { value: "DISCOVERED", label: "Discovered" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "FAVORITED", label: "Favorited" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "all", label: "Everything" },
];

export const STATE_LABEL: Record<string, string> = {
  DISCOVERED: "New",
  IN_REVIEW: "In review",
  FAVORITED: "Favorite",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export function labelOf(options: Option[], value: string | null | undefined): string {
  return options.find((o) => o.value === value)?.label ?? value ?? "";
}

// --- CRM (spec §20) ---

export const CRM_STAGES: Option[] = [
  { value: "READY_TO_CONTACT", label: "Ready to contact" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "NO_RESPONSE", label: "No response" },
  { value: "REPLIED", label: "Replied" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "MEETING", label: "Meeting" },
  { value: "OFFER_SENT", label: "Offer sent" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

export const CONTACT_CHANNELS: Option[] = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "PHONE", label: "Phone" },
  { value: "INSTAGRAM_DM", label: "Instagram DM" },
  { value: "EMAIL", label: "Email" },
  { value: "WEBSITE_FORM", label: "Website form" },
  { value: "IN_PERSON", label: "In person" },
];

export const EVENT_TYPES: Option[] = [
  { value: "OUTBOUND", label: "I sent a message / called" },
  { value: "INBOUND", label: "They replied" },
  { value: "NOTE", label: "Note" },
];

export const EVENT_LABEL: Record<string, string> = {
  OUTBOUND: "Outbound",
  INBOUND: "Reply",
  NOTE: "Note",
  STAGE_CHANGE: "Stage",
};
