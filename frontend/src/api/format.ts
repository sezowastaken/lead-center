// Backend timestamps are naive UTC ISO strings; display in local time.

export function parseUtc(ts: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(ts) ? ts : ts + "Z");
}

export function fmtDateTime(ts: string | null | undefined): string {
  return ts ? parseUtc(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export function fmtDate(ts: string | null | undefined): string {
  return ts ? parseUtc(ts).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

/** A YYYY-MM-DD calendar date (no timezone conversion). */
export function fmtDay(day: string | null | undefined): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isDue(day: string | null | undefined): boolean {
  return !!day && day <= todayIso();
}

export function fmtMoney(v: number | null | undefined): string {
  return v == null ? "—" : `${v.toLocaleString()} ₺`;
}
