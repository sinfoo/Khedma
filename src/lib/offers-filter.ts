// Client-safe offer filtering: no database import, so the Offers page can filter instantly in the browser.
import { REMOTE_CODE, countryOf } from "./geo";
import { JOB_TYPES, type Evaluation, type JobType } from "./types";
import { fold } from "./sources/classify";

export const VERDICTS = ["apply_now", "apply", "maybe", "skip"] as const;
export const SORTS = ["newest", "score", "deadline", "company"] as const;
export type Sort = (typeof SORTS)[number];
export type VerdictFilter = Evaluation["verdict"] | "none";

export interface OfferFilters {
  q: string;
  types: JobType[];
  verdicts: VerdictFilter[];
  min: number; // 0 = any, else 1..5
  remote: boolean;
  countries: string[]; // ISO codes or REMOTE
  deadline: boolean;
  starred: boolean;
  tracked: "" | "yes" | "no";
  source: string;
  dup: boolean;
  archived: boolean;
  sort: Sort;
}

type Params = URLSearchParams | Record<string, string | string[] | undefined>;
const get = (p: Params, k: string): string => {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  return (Array.isArray(v) ? v[0] : (v ?? "")).trim();
};
const list = <T extends string>(raw: string, allowed: readonly T[]) => raw.split(",").filter((x): x is T => (allowed as readonly string[]).includes(x));

export function parseFilters(p: Params): OfferFilters {
  const min = Number(get(p, "min"));
  const sort = get(p, "sort") as Sort;
  const tracked = get(p, "tracked");
  return {
    q: get(p, "q").slice(0, 100),
    types: list(get(p, "type"), JOB_TYPES),
    verdicts: list<VerdictFilter>(get(p, "verdict"), [...VERDICTS, "none"]),
    min: Number.isFinite(min) ? Math.min(5, Math.max(0, Math.round(min * 2) / 2)) : 0,
    remote: get(p, "remote") === "1",
    countries: get(p, "country")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$|^REMOTE$/.test(c))
      .slice(0, 30),
    deadline: get(p, "deadline") === "1",
    starred: get(p, "starred") === "1",
    tracked: tracked === "yes" || tracked === "no" ? tracked : "",
    source: get(p, "source").slice(0, 30),
    dup: get(p, "dup") === "1",
    archived: get(p, "archived") === "1",
    sort: SORTS.includes(sort) ? sort : "score",
  };
}

/** Canonical query string (stable key order, defaults omitted). Used for saved views and export links. */
export function filtersToQuery(f: OfferFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.verdicts.length) p.set("verdict", f.verdicts.join(","));
  if (f.min) p.set("min", String(f.min));
  if (f.remote) p.set("remote", "1");
  if (f.countries.length) p.set("country", f.countries.join(","));
  if (f.deadline) p.set("deadline", "1");
  if (f.starred) p.set("starred", "1");
  if (f.tracked) p.set("tracked", f.tracked);
  if (f.source) p.set("source", f.source);
  if (f.dup) p.set("dup", "1");
  if (f.archived) p.set("archived", "1");
  if (f.sort !== "score") p.set("sort", f.sort);
  return p.toString();
}

export interface OfferRow {
  id: number;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  type: JobType;
  source: string;
  url: string;
  tags: string[];
  deadline: string | null;
  created_at: string;
  archived: boolean;
  starred: boolean;
  score: number | null;
  verdict: Evaluation["verdict"] | null;
  engine: string | null;
  appId: number | null;
  status: string | null;
  dup: { id: number; title: string; newer: boolean } | null;
}

const today = () => new Date().toLocaleDateString("sv");
const dkey = (d: string | null) => (!d ? "9" : d.slice(0, 10) < today() ? `8${d}` : `0${d}`);

export function applyFilters(rows: OfferRow[], f: OfferFilters): OfferRow[] {
  const q = fold(f.q);
  const out = rows.filter((r) => {
    if (q && !fold(`${r.title} ${r.company} ${r.location} ${r.tags.join(" ")}`).includes(q)) return false;
    if (f.types.length && !f.types.includes(r.type)) return false;
    if (f.verdicts.length && !f.verdicts.includes(r.verdict ?? "none")) return false;
    if (f.min && (r.score ?? 0) < f.min) return false;
    if (f.remote && !r.remote) return false;
    if (f.countries.length) {
      const code = countryOf(r.location) ?? (r.remote ? REMOTE_CODE : null);
      if (!code || !f.countries.includes(code)) return false;
    }
    if (f.deadline && !r.deadline) return false;
    if (f.starred && !r.starred) return false;
    if (f.tracked === "yes" && !r.appId) return false;
    if (f.tracked === "no" && r.appId) return false;
    if (f.source && r.source !== f.source) return false;
    if (f.dup && !r.dup) return false;
    return true;
  });
  const by: Record<Sort, (a: OfferRow, b: OfferRow) => number> = {
    newest: (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id,
    score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || b.id - a.id,
    // Live deadlines first (soonest on top), then expired ones, then none.
    deadline: (a, b) => dkey(a.deadline).localeCompare(dkey(b.deadline)) || b.id - a.id,
    company: (a, b) => a.company.localeCompare(b.company) || a.title.localeCompare(b.title),
  };
  return out.sort(by[f.sort]);
}
