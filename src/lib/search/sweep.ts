// Housekeeping pass over open offers: urgent deadlines and mass postings. Server only.
import { db } from "../db";
import { dedupeKey } from "../sources/classify";
import { ensureSearchSchema } from "./store";

type Row = Record<string, unknown>;

export interface SweepResult {
  /** Open offers whose deadline is within 7 days (a missing deadline is never guessed). */
  urgent: { id: number; title: string; company: string; deadline: string }[];
  /** Mass postings folded: one row kept per company + title, the city variants archived. */
  merged: { keptId: number; archived: number[]; locations: string[] }[];
}

export const URGENT_DAYS = 7;

export function urgentDeadline(deadline: string | null, now = Date.now()): boolean {
  if (!deadline) return false;
  const d = new Date(deadline).getTime();
  if (Number.isNaN(d)) return false;
  const days = (d - now) / 86_400_000;
  return days >= -0.5 && days <= URGENT_DAYS;
}

/**
 * Same company + title in 3+ distinct locations = one requisition opened per city: keep the oldest
 * row, write every city on it and archive the others (their match_why says which row absorbed them).
 */
export function sweep(now = Date.now()): SweepResult {
  ensureSearchSchema();
  const d = db();
  const rows = d.prepare("SELECT id, title, company, location, deadline, match_why FROM jobs WHERE archived = 0 ORDER BY id").all() as Row[];
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
    const [keep, ...rest] = g;
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
  return { urgent, merged };
}
