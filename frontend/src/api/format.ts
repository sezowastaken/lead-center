// Backend timestamps are naive UTC ISO strings; display in local time, in the selected language.

import { getLocale } from "../i18n";

export function parseUtc(ts: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(ts) ? ts : ts + "Z");
}

export function fmtDateTime(ts: string | null | undefined): string {
  return ts ? parseUtc(ts).toLocaleString(getLocale(), { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export function fmtDate(ts: string | null | undefined): string {
  return ts ? parseUtc(ts).toLocaleDateString(getLocale(), { dateStyle: "medium" }) : "—";
}

/** A YYYY-MM-DD calendar date (no timezone conversion). */
export function fmtDay(day: string | null | undefined): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(getLocale(), { dateStyle: "medium" });
}

export function fmtNumber(n: number, digits?: number): string {
  return n.toLocaleString(getLocale(), digits == null ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A percentage given as 0–100 ("56%" in English, "%56" in Turkish). */
export function fmtPercent(pct: number, digits = 0): string {
  return (pct / 100).toLocaleString(getLocale(), { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isDue(day: string | null | undefined): boolean {
  return !!day && day <= todayIso();
}

export function fmtMoney(v: number | null | undefined): string {
  return v == null ? "—" : `${v.toLocaleString(getLocale())} ₺`;
}
