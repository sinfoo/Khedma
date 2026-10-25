// Housekeeping pass over open offers: urgent deadlines and mass postings. Server only.
import { db, KEPT_BY_USER } from "../db";
import { dedupeKey } from "../sources/classify";
import { ensureSearchSchema } from "./store";

type Row = Record<string, unknown>;

export interface SweepResult {
  /** Open offers whose deadline is within 7 days (a missing deadline is never guessed). */
  urgent: { id: number; title: string; company: string; deadline: string }[];
  /** Mass postings folded: one row kept per company + title, the city variants archived. */
  merged: { keptId: number; archived: number[]; locations: string[] }[];
  /** Offers archived because their deadline passed (never starred or tracked ones). */
  expired: number[];
}

export const URGENT_DAYS = 7;

/** Whole calendar days from today to the deadline's day, in local time: 0 = today, -1 = yesterday. */
export function daysUntil(deadline: string | null, now = Date.now()): number | null {
  if (!deadline) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline);
  const d = ymd ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) : new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date(now);
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86_400_000);
}

/** Deadline today or within URGENT_DAYS (today stays urgent until the day ends). */
export function urgentDeadline(deadline: string | null, now = Date.now()): boolean {
  const n = daysUntil(deadline, now);
  return n !== null && n >= 0 && n <= URGENT_DAYS;
}

/** Deadline more than a day in the past (a day of grace for time zones and same-day applications). */
export function expiredDeadline(deadline: string | null, now = Date.now()): boolean {
  const n = daysUntil(deadline, now);
  return n !== null && n < -1;
}

/**
 * Same company + title in 3+ distinct locations = one requisition opened per city: keep the oldest
 * row, write every city on it and archive the others (their match_why says which row absorbed them).
 */
export function sweep(now = Date.now()): SweepResult {
  ensureSearchSchema();
  const d = db();
  const rows = d.prepare(`SELECT id, title, company, location, deadline, match_why, (${KEPT_BY_USER}) AS kept FROM jobs WHERE archived = 0 ORDER BY id`).all() as Row[];
  const urgent = rows
    .filter((r) => urgentDeadline((r.deadline as string) ?? null, now))
    .map((r) => ({ id: r.id as number, title: r.title as string, company: r.company as string, deadline: r.deadline as string }));

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = dedupeKey(r.company as string, r.title as string);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const merged: SweepResult["merged"] = [];
  const upd = d.prepare("UPDATE jobs SET location = ? WHERE id = ?");
  const arch = d.prepare("UPDATE jobs SET archived = 1, match_why = ? WHERE id = ?");
  for (const g of groups.values()) {
    const locs = [...new Set(g.map((r) => String(r.location ?? "").trim()).filter(Boolean))];
    if (g.length < 3 || locs.length < 3) continue;
    // The row the user starred or applied to is the one kept; other kept rows are never archived either.
    const [keep, ...others] = [...g].sort((a, b) => Number(b.kept) - Number(a.kept));
    const rest = others.filter((r) => !r.kept);
    // ponytail: the joined list lives in `location`; a locations[] column can replace it if other features need the parts.
    upd.run(locs.join(" · "), keep.id as number);
    const why = (id: number, prev: unknown) => {
      let list: string[] = [];
      try {
        list = JSON.parse(String(prev || "[]")) as string[];
      } catch {
        list = [];
      }
      return JSON.stringify([...list.filter((w) => !w.startsWith("merged:")), `merged:${id}`]);
    };
    for (const r of rest) arch.run(why(keep.id as number, r.match_why), r.id as number);
    merged.push({ keptId: keep.id as number, archived: rest.map((r) => r.id as number), locations: locs });
  }
  // Expired offers leave the list; starred ones and those with an application stay where the user put them.
  const expiredRows = (d.prepare(`SELECT id, deadline, match_why FROM jobs WHERE archived = 0 AND deadline IS NOT NULL AND NOT (${KEPT_BY_USER})`).all() as Row[]).filter(
    (r) => expiredDeadline(r.deadline as string, now),
  );
  const tag = (prev: unknown) => {
    let list: string[] = [];
    try {
      list = JSON.parse(String(prev || "[]")) as string[];
    } catch {
      list = [];
    }
    return JSON.stringify([...list.filter((w) => w !== "expired"), "expired"]);
  };
  for (const r of expiredRows) arch.run(tag(r.match_why), r.id as number);
  return { urgent, merged, expired: expiredRows.map((r) => r.id as number) };
}
