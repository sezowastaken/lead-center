export type RecordState = "DISCOVERED" | "IN_REVIEW" | "REJECTED" | "FAVORITED" | "APPROVED";

export interface SectorRule {
  id: number;
  rule_type: string;
  tag_key: string | null;
  tag_value: string | null;
  regex: string | null;
  enabled: boolean;
}

export interface Sector {
  id: number;
  name: string;
  commercial_priority: string;
  osm_coverage: string;
  osm_discovery_enabled: boolean;
  enabled: boolean;
  notes: string | null;
  rules: SectorRule[];
}

export interface Location {
  id: number;
  name: string;
  parent_location_id: number | null;
  location_type: string;
  osm_relation_id: number | null;
  enabled: boolean;
}

export interface SectorBrief {
  id: number;
  name: string;
  commercial_priority: string;
  osm_coverage: string;
}

export interface DiscoveryRun {
  id: number;
  provider: string;
  sector: SectorBrief | null;
  location: { id: number; name: string } | null;
  query_or_source: string | null;
  from_cache: boolean;
  started_at: string;
  completed_at: string | null;
  result_count: number;
  new_count: number;
  known_count: number;
  error: string | null;
}

export interface Review {
  business_active: string | null;
  rebrand_status: string | null;
  verified_website_status: string | null;
  website_issues: string[];
  instagram_status: string | null;
  reachability: string[];
  commercial_value: string | null;
  customer_value: string | null;
  contact_decision: string | null;
  manual_phone: string | null;
  manual_website: string | null;
  manual_instagram: string | null;
  manual_email: string | null;
  current_brand_name: string | null;
  notes: string | null;
}

export interface Business {
  id: number;
  osm_type: string;
  osm_id: number;
  osm_url: string;
  name: string | null;
  name_source: string | null;
  lat: number | null;
  lon: number | null;
  phone: string | null;
  phone_raw: string | null;
  website: string | null;
  email: string | null;
  opening_hours: string | null;
  address_text: string | null;
  osm_instagram: string | null;
  osm_facebook: string | null;
  normalized_website_type: string;
  sector: SectorBrief | null;
  location: { id: number; name: string } | null;
  first_seen_at: string;
  last_seen_at: string;
  times_seen: number;
  record_state: RecordState;
  favorite: boolean;
  reject_reason: string | null;
  reject_note: string | null;
  decided_at: string | null;
  has_review: boolean;
  has_notes: boolean;
  lead_record_id: number | null;
}

export interface BusinessDetail extends Business {
  raw_tags: Record<string, string>;
  review: (Review & { reviewed_at: string; updated_at: string }) | null;
}

export interface BusinessPage {
  items: Business[];
  total: number;
  limit: number;
  offset: number;
}

export interface QueueNext {
  business: BusinessDetail | null;
  remaining: number;
}

export interface BusinessFilters {
  state?: string;
  sector_id?: string;
  location_id?: string;
  website_type?: string;
  has_phone?: string;
  has_website?: string;
  favorite?: string;
  discovered_since?: string;
  commercial_priority?: string;
  osm_coverage?: string;
  q?: string;
  sort?: string;
}

export interface OutreachEvent {
  id: number;
  event_type: "OUTBOUND" | "INBOUND" | "NOTE" | "STAGE_CHANGE";
  channel: string | null;
  message_or_note: string | null;
  stage_from: string | null;
  stage_to: string | null;
  event_at: string;
  created_at: string;
}

export interface LeadFields {
  preferred_contact_channel: string | null;
  personalized_angle: string | null;
  message_draft: string | null;
  estimated_scope: string | null;
  quoted_price: number | null;
  next_follow_up_at: string | null; // YYYY-MM-DD
  won_value: number | null;
  lost_reason: string | null;
}

export interface Lead extends LeadFields {
  id: number;
  stage: string;
  first_contact_at: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
  event_count: number;
  business: Business;
  contact_phone: string | null;
  contact_website: string | null;
  contact_instagram: string | null;
  contact_email: string | null;
  display_name: string | null;
  latest_note: string | null;
}

export interface LeadDetail extends Lead {
  events: OutreachEvent[];
}

export interface Ratio {
  num: number;
  den: number;
  pct: number | null;
}

export interface PeriodCounts {
  discovered: number;
  reviewed: number;
  rejected: number;
  favorited: number;
  approved: number;
  messages_sent: number;
  replies: number;
  contacted: number;
  replied: number;
  meetings: number;
  offers: number;
  wins: number;
  losses: number;
}

export interface Dashboard {
  today: PeriodCounts;
  month: PeriodCounts;
  totals: {
    businesses: number;
    in_queue: number;
    favorites: number;
    rejected: number;
    approved: number;
    ready_to_contact: number;
    follow_ups_due: number;
  };
  pipeline: { stage: string; count: number }[];
  ratios: Record<string, Ratio>;
  sectors: { sector: string; discovered: number; rejected: number; approved: number; contacted: number; replied: number; won: number }[];
  reject_reasons: { reason: string; count: number }[];
}

export interface Backup {
  name: string;
  created_at: string;
  size_bytes: number;
  manual: boolean;
}
