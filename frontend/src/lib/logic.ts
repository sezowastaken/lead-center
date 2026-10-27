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

/* ---------- Review queue: Previous / Skip / Next ---------- */

/**
 * `trail` holds businesses already left behind (decided or skipped), oldest first.
 * `back` is null while viewing the queue head, or an index into `trail` while looking back.
 */
export interface QueueNav {
  trail: number[];
  back: number | null;
  afterId: number | undefined; // the queue head is the next queued business after this id
}

export type QueueAction = { type: "advance"; fromId: number } | { type: "previous" } | { type: "next" } | { type: "reset" };

export const initialQueueNav: QueueNav = { trail: [], back: null, afterId: undefined };

export function queueNavReducer(s: QueueNav, a: QueueAction): QueueNav {
  switch (a.type) {
    case "advance": {
      if (s.back !== null) return { ...s, back: s.back + 1 < s.trail.length ? s.back + 1 : null };
      const trail = s.trail[s.trail.length - 1] === a.fromId ? s.trail : [...s.trail, a.fromId];
      return { trail, back: null, afterId: a.fromId };
    }
    case "previous":
      if (s.trail.length === 0) return s;
      return { ...s, back: s.back === null ? s.trail.length - 1 : Math.max(0, s.back - 1) };
    case "next":
      if (s.back === null) return s;
      return { ...s, back: s.back + 1 < s.trail.length ? s.back + 1 : null };
    case "reset":
      return initialQueueNav;
  }
}
