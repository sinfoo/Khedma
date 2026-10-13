import type { Locale } from "@/lib/types";

/** Parse the date shapes stored in the DB: SQLite UTC "YYYY-MM-DD HH:MM:SS", ISO with Z, local date or local datetime. */
export function parseWhen(s: string | null | undefined): Date | null {
  if (!s) return null;
  let d: Date;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) d = new Date(s.replace(" ", "T") + "Z");
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(s + "T00:00:00");
  else d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const tag = (l: Locale) => (l === "fr" ? "fr-TN" : "en-GB");

export function shortDate(s: string | null | undefined, locale: Locale, withTime = false): string {
  const d = parseWhen(s);
  if (!d) return "—";
  return d.toLocaleString(tag(locale), withTime ? { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : { day: "numeric", month: "short" });
}

export function relTime(s: string | null | undefined, locale: Locale, now: number): string {
  const d = parseWhen(s);
  if (!d) return "—";
  const sec = Math.round((d.getTime() - now) / 1000);
  const abs = Math.abs(sec);
  const rtf = new Intl.RelativeTimeFormat(tag(locale), { numeric: "auto" });
  if (abs < 60) return rtf.format(sec, "second");
  if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(sec / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(sec / (86400 * 30)), "month");
  return rtf.format(Math.round(sec / (86400 * 365)), "year");
}

/** Whole days from `from` to now (never negative). */
export function daysSince(s: string | null | undefined, now: number): number {
  const d = parseWhen(s);
  return d ? Math.max(0, Math.floor((now - d.getTime()) / 86400000)) : 0;
}
