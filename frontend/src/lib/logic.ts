// Pure UI logic, kept out of components so it can be unit tested.

import type { BusinessFilters, Ratio } from "../api/types";

/* ---------- Discover: website filter (one control for has_website + website_type) ---------- */

export const WEBSITE_FILTER_OPTIONS = [
  { value: "has:true", label: "Has a website in OSM" },
  { value: "has:false", label: "No website recorded (unknown)" },
  { value: "type:OWN_WEBSITE", label: "Own website" },
  { value: "type:SOCIAL_ONLY", label: "Social media only" },
  { value: "type:THIRD_PARTY_BOOKING", label: "Booking platform only" },
  { value: "type:WHATSAPP_ONLY", label: "WhatsApp link only" },
  { value: "type:MARKETPLACE_PROFILE", label: "Marketplace profile" },
  { value: "type:BROKEN_OR_INVALID", label: "Broken / invalid URL" },
];

export function websiteFilterValue(f: BusinessFilters): string {
  if (f.website_type) return `type:${f.website_type}`;
  if (f.has_website) return `has:${f.has_website}`;
  return "";
}

export function withWebsiteFilter(f: BusinessFilters, value: string): BusinessFilters {
  const next: BusinessFilters = { ...f, website_type: undefined, has_website: undefined };
  const [kind, v] = value.split(":");
  if (kind === "type") next.website_type = v;
  if (kind === "has") next.has_website = v;
  return next;
}

/** Filters that live behind "More filters", and how many differ from their defaults. */
export const SECONDARY_FILTER_KEYS = ["state", "has_phone", "favorite", "commercial_priority", "osm_coverage", "discovered_since"] as const;

export function secondaryFilterCount(f: BusinessFilters, defaults: BusinessFilters): number {
  return SECONDARY_FILTER_KEYS.filter((k) => (f[k] ?? "") !== (defaults[k] ?? "")).length;
}

/* ---------- Dashboard: conversion ratios ---------- */

export const LOW_SAMPLE = 5;

export function ratioView(r: Ratio): { fraction: string; pct: string | null; lowSample: boolean } {
  return {
    fraction: `${r.num} / ${r.den}`,
    pct: r.pct == null ? null : `${Math.round(r.pct)}%`,
    lowSample: r.den < LOW_SAMPLE,
  };
}

/* ---------- Lead page: suggested stage when logging outreach ---------- */

export function suggestStage(eventType: string, current: string): string {
  if (eventType === "OUTBOUND" && current === "READY_TO_CONTACT") return "CONTACTED";
  if (eventType === "INBOUND" && ["READY_TO_CONTACT", "CONTACTED", "NO_RESPONSE", "FOLLOW_UP"].includes(current)) return "REPLIED";
  return "";
}

/* ---------- Coverage: click-through to Browse ---------- */

/** Browse URL for a Coverage row/cell. `null` ids mean "unassigned" and map to the API's "none". */
export function browseLink(state: string, ids: { sector?: number | null; location?: number | null }): string {
  const sp = new URLSearchParams();
  if (state !== "queue") sp.set("state", state); // queue is Browse's default
  if (ids.sector !== undefined) sp.set("sector_id", ids.sector === null ? "none" : String(ids.sector));
  if (ids.location !== undefined) sp.set("location_id", ids.location === null ? "none" : String(ids.location));
  const s = sp.toString();
  return s ? `/discover?${s}` : "/discover";
}

/* ---------- Review weights ---------- */

export const WEIGHT_MIN = 0.2;
export const WEIGHT_MAX = 3;

export function weightLabel(w: number): string {
  return `priority ×${w.toFixed(1)}`;
}

/** A plain-language hint for a weight value, shown next to the slider. */
export function weightHint(w: number): string {
  if (w >= 1.75) return "much more often";
  if (w >= 1.25) return "more often";
  if (w > 0.85) return "normal";
  if (w >= 0.5) return "less often";
  return "rarely, until the end";
}
