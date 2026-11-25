// Client-safe offer filtering: no database import, so the Offers page can filter instantly in the browser.
import { REGIONS, REMOTE_CODE, countryOf, type RegionKey } from "./geo";
import { compileKeyword, fold as foldPlain } from "./search/filter";
import { JOB_TYPES, type Evaluation, type JobType } from "./types";
import { fold } from "./sources/classify";
import type { EvergreenReason } from "./evergreen";

export const VERDICTS = ["apply_now", "apply", "maybe", "skip"] as const;

/** How many offers "Score the best matches" scores in one run. */
export const BEST_BATCH = 20;
/**
 * One honest estimate for n scores with the active engine: the online AI reads each posting (about 10 s each),
 * the offline rules are near instant. Units read the same in French and English.
 */
export function scoreTime(n: number, online: boolean): string {
  const s = n * (online ? 10 : 0.2);
  if (s < 60) return "< 1 min";
  const m = Math.round(s / 60);
  return m < 60 ? `≈ ${m} min` : `≈ ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
export const SORTS = ["newest", "score", "deadline", "company"] as const;
export type Sort = (typeof SORTS)[number];
export type VerdictFilter = Evaluation["verdict"] | "none";
/** "Posted in the last N days" windows. */
export const POSTED_DAYS = [1, 3, 7, 30] as const;
export type PostedDays = (typeof POSTED_DAYS)[number];
const REGION_KEYS = REGIONS.map((r) => r.key);

export interface OfferFilters {
  q: string;
  /** Exclude words: an offer whose title, company, place or tags contain one of them is hidden. */
  not: string[];
  types: JobType[];
  verdicts: VerdictFilter[];
  min: number; // 0 = any, else 1..5
  remote: boolean;
  countries: string[]; // ISO codes or REMOTE
  /** Region pills; an offer passes when its country is in a picked region or in `countries`. */
  regions: RegionKey[];
  /** Posted in the last N days (the day Khedma first saw it when the board gives no date); 0 = any time. */
  posted: 0 | PostedDays;
  deadline: boolean;
  starred: boolean;
  tracked: "" | "yes" | "no";
  source: string;
  dup: boolean;
  archived: boolean;
  /** Also list expired offers and "skip" verdicts, hidden by default. */
  all: boolean;
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
  const posted = Number(get(p, "posted")) as PostedDays;
  return {
    q: get(p, "q").slice(0, 100),
    not: [...new Set(get(p, "not").split(",").map((w) => w.trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 10),
    types: list(get(p, "type"), JOB_TYPES),
    verdicts: list<VerdictFilter>(get(p, "verdict"), [...VERDICTS, "none"]),
    min: Number.isFinite(min) ? Math.min(5, Math.max(0, Math.round(min * 2) / 2)) : 0,
    remote: get(p, "remote") === "1",
    countries: get(p, "country")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$|^REMOTE$/.test(c))
      .slice(0, 30),
    regions: list(get(p, "region"), REGION_KEYS),
    posted: POSTED_DAYS.includes(posted) ? posted : 0,
    deadline: get(p, "deadline") === "1",
    starred: get(p, "starred") === "1",
    tracked: tracked === "yes" || tracked === "no" ? tracked : "",
    source: get(p, "source").slice(0, 30),
    dup: get(p, "dup") === "1",
    archived: get(p, "archived") === "1",
    all: get(p, "all") === "1",
    sort: SORTS.includes(sort) ? sort : "score",
  };
}

/** Canonical query string (stable key order, defaults omitted). Used for saved views and export links. */
export function filtersToQuery(f: OfferFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.not.length) p.set("not", f.not.join(","));
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.verdicts.length) p.set("verdict", f.verdicts.join(","));
  if (f.min) p.set("min", String(f.min));
  if (f.remote) p.set("remote", "1");
  if (f.countries.length) p.set("country", f.countries.join(","));
  if (f.regions.length) p.set("region", f.regions.join(","));
  if (f.posted) p.set("posted", String(f.posted));
  if (f.deadline) p.set("deadline", "1");
  if (f.starred) p.set("starred", "1");
  if (f.tracked) p.set("tracked", f.tracked);
  if (f.source) p.set("source", f.source);
  if (f.dup) p.set("dup", "1");
  if (f.archived) p.set("archived", "1");
  if (f.all) p.set("all", "1");
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
  /** Posting date from the board (yyyy-mm-dd), when it gives one. */
  posted_at?: string | null;
  created_at: string;
  archived: boolean;
  starred: boolean;
  score: number | null;
  verdict: Evaluation["verdict"] | null;
  engine: string | null;
  appId: number | null;
  status: string | null;
  dup: { id: number; title: string; newer: boolean } | null;
  evergreen: EvergreenReason[];
}

const today = () => new Date().toLocaleDateString("sv");
const dkey = (d: string | null) => (!d ? "9" : d.slice(0, 10) < today() ? `8${d}` : `0${d}`);
const expired = (r: OfferRow) => !!r.deadline && r.deadline.slice(0, 10) < today();

/**
 * Best-first rank: live offers before expired ones, then the fit score. A keyword estimate counts half a point less
 * than a real evaluation, so a 4.2 estimate no longer outranks a 4.0 scored by the AI.
 */
// ponytail: flat 0.5 discount for estimates; calibrate against outcomes if the ranking still misleads.
const rank = (r: OfferRow) => (expired(r) ? -10 : 0) + (r.score === null ? -1 : r.score - (r.engine === "heuristic" ? 0.5 : 0));

/** Country code of an offer's place (REMOTE for remote-only ones), remembered per location: `countryOf` is regex-heavy. */
const places = new Map<string, string | null>();
export function placeOf(r: Pick<OfferRow, "location" | "remote">): string | null {
  const k = `${r.remote ? 1 : 0}${r.location}`;
  if (!places.has(k)) places.set(k, countryOf(r.location) ?? (r.remote ? REMOTE_CODE : null));
  return places.get(k)!;
}

const dayAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString("sv");
/** The day an offer was posted; when the board gives no date, the day Khedma first saw it. */
// ponytail: day granularity (boards publish a date, not an hour), so "24 h" means today or yesterday.
export const postedDay = (r: Pick<OfferRow, "posted_at" | "created_at">) => (r.posted_at || r.created_at).slice(0, 10);

/** One test per filter group. A row is listed when every group passes; facet counts leave one group out at a time. */
function tests(f: OfferFilters) {
  const q = fold(f.q);
  // Same matcher as the scan's "also exclude" list: plain words are substrings, `word:senior` is a whole word.
  const not = f.not.map(compileKeyword);
  const codes = new Set<string>([...f.countries, ...REGIONS.filter((x) => f.regions.includes(x.key)).flatMap((x) => x.codes)]);
  const since = f.posted ? dayAgo(f.posted) : "";
  const text = (r: OfferRow) => `${r.title} ${r.company} ${r.location} ${r.tags.join(" ")}`;
  // Tracked and starred offers, the archive and "show all" are never trimmed.
  const keep = (r: OfferRow) => f.all || f.archived || !!r.appId || r.starred;
  return {
    base: (r: OfferRow) => keep(r) || !expired(r),
    q: (r: OfferRow) => !q || fold(text(r)).includes(q),
    // ponytail: the description is not sent to the list, so exclude words read the same fields as the search box.
    not: (r: OfferRow) => {
      if (!not.length) return true;
      const t = foldPlain(text(r));
      return !not.some((m) => m(t));
    },
    type: (r: OfferRow) => !f.types.length || f.types.includes(r.type),
    // "Skip" verdicts stay out of the default list, but picking that verdict by name lists them.
    verdict: (r: OfferRow) => (f.verdicts.length ? f.verdicts.includes(r.verdict ?? "none") : keep(r) || r.verdict !== "skip"),
    min: (r: OfferRow) => !f.min || (r.score ?? 0) >= f.min,
    remote: (r: OfferRow) => !f.remote || r.remote,
    place: (r: OfferRow) => !codes.size || codes.has(placeOf(r) ?? ""),
    posted: (r: OfferRow) => !since || postedDay(r) >= since,
    deadline: (r: OfferRow) => !f.deadline || !!r.deadline,
    starred: (r: OfferRow) => !f.starred || r.starred,
    tracked: (r: OfferRow) => !f.tracked || (f.tracked === "yes") === !!r.appId,
    source: (r: OfferRow) => !f.source || r.source === f.source,
    dup: (r: OfferRow) => !f.dup || !!r.dup,
  };
}

type Counts = Record<string, number>;
export interface Facets {
  type: Counts;
  verdict: Counts;
  country: Counts;
  region: Counts;
  posted: Counts;
  tracked: Counts;
  source: Counts;
  /** On/off filters: how many offers the list would hold with the flag on. */
  flag: Counts;
}

/**
 * How many offers each filter option would list, the other filters staying as they are: an option's count ignores
 * its own group, so picking "PFE" does not zero the count next to "Stage".
 */
export function facetCounts(rows: OfferRow[], f: OfferFilters): Facets {
  const ts = Object.entries(tests(f));
  const out: Facets = { type: {}, verdict: {}, country: {}, region: {}, posted: {}, tracked: {}, source: {}, flag: {} };
  const inc = (c: Counts, k: string) => (c[k] = (c[k] ?? 0) + 1);
  const days = POSTED_DAYS.map((n) => [String(n), dayAgo(n)] as const);
  for (const r of rows) {
    const failed = ts.filter(([, t]) => !t(r)).map(([k]) => k);
    if (failed.length > 1) continue;
    // The row counts for a group when that group is the only thing (or nothing) keeping it out.
    const open = (g: string) => !failed.length || failed[0] === g;
    if (open("type")) inc(out.type, r.type);
    if (open("verdict")) inc(out.verdict, r.verdict ?? "none");
    if (open("place")) {
      const code = placeOf(r);
      if (code) inc(out.country, code);
      for (const x of REGIONS) if (code && (x.codes as readonly string[]).includes(code)) inc(out.region, x.key);
    }
    if (open("posted")) for (const [n, since] of days) if (postedDay(r) >= since) inc(out.posted, n);
    if (open("tracked")) inc(out.tracked, r.appId ? "yes" : "no");
    if (open("source")) inc(out.source, r.source);
    if (open("remote") && r.remote) inc(out.flag, "remote");
    if (open("deadline") && r.deadline) inc(out.flag, "deadline");
    if (open("starred") && r.starred) inc(out.flag, "starred");
    if (open("dup") && r.dup) inc(out.flag, "dup");
  }
  return out;
}

export function applyFilters(rows: OfferRow[], f: OfferFilters): OfferRow[] {
  const ts = Object.values(tests(f));
  const out = rows.filter((r) => ts.every((t) => t(r)));
  const by: Record<Sort, (a: OfferRow, b: OfferRow) => number> = {
    newest: (a, b) => postedDay(b).localeCompare(postedDay(a)) || b.created_at.localeCompare(a.created_at) || b.id - a.id,
    score: (a, b) => rank(b) - rank(a) || b.id - a.id,
    // Live deadlines first (soonest on top), then expired ones, then none.
    deadline: (a, b) => dkey(a.deadline).localeCompare(dkey(b.deadline)) || b.id - a.id,
    company: (a, b) => a.company.localeCompare(b.company) || a.title.localeCompare(b.title),
  };
  return out.sort(by[f.sort]);
}
