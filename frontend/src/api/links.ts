import { getLang, translate } from "../i18n";
import type { Business } from "./types";

// Manual research links (spec §23). Plain URLs — no Google API involved.

export function googleSearchUrl(b: Business): string | null {
  if (!b.name) return null;
  const q = [b.name, b.location?.name].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function googleMapsUrl(b: Business): string | null {
  if (b.lat == null || b.lon == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lon}`;
}

export function externalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function displayName(b: Business): string {
  return b.name ?? translate(getLang(), "common.unnamedOsm");
}
