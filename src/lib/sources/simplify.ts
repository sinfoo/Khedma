// SimplifyJobs' community lists of internships and new-grad roles (mostly US, Canada, UK), read from the JSON the
// repos build their README from. No key; each file is ~13 MB, so the open rows are kept slim and cached for 12 h.
// The repos carry no license, but each row links straight to the employer's own posting.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, matchesKeywords, normalizeDate } from "./classify";
import { getText } from "./http";

const LISTS = {
  intern: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
  newgrad: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
} as const;
type List = keyof typeof LISTS;
const TTL_MS = 12 * 3600_000;
const MAX_OUT = 300;

export interface SimplifyRow {
  title?: string;
  company_name?: string;
  locations?: string[];
  url?: string;
  date_posted?: number; // epoch seconds
  active?: boolean;
  is_visible?: boolean;
  sponsorship?: string;
  terms?: string[];
  degrees?: string[];
  category?: string;
}

const SHORT: Record<string, string> = { NYC: "New York, NY", SF: "San Francisco, CA", LA: "Los Angeles, CA" };
const CA_PROVINCES = new Set("AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" "));
const US_STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" "));

/** "Austin, TX" -> "Austin, TX, United States" so the country is recognised; Canadian provinces get ", Canada". */
export function simplifyPlace(raw: string): string {
  const p = SHORT[raw.trim()] ?? raw.trim();
  const st = /^[^,]+,\s*([A-Z]{2})$/.exec(p)?.[1];
  if (st && US_STATES.has(st)) return `${p}, United States`;
  return st && CA_PROVINCES.has(st) ? `${p}, Canada` : p;
}

/** Open rows only, without the ones that require U.S. citizenship. */
export function mapSimplify(rows: SimplifyRow[], list: List): NewJob[] {
  const out: NewJob[] = [];
  for (const r of rows) {
    if (!r.active || !r.is_visible || !r.title || !r.url) continue;
    if (/citizenship is required/i.test(r.sponsorship ?? "")) continue;
    const title = r.title.trim();
    const places = (r.locations ?? []).map(simplifyPlace);
    const location = places.length > 3 ? `${places.slice(0, 3).join(" · ")} · +${places.length - 3}` : places.join(" · ");
    const description = [
      r.category && `Category: ${r.category}`,
      r.terms?.length && `Term: ${r.terms.join(", ")}`,
      r.degrees?.length && `Degrees: ${r.degrees.join(", ")}`,
      r.sponsorship && r.sponsorship !== "Other" && `Visa sponsorship: ${r.sponsorship}`,
      places.length > 3 && `Locations: ${places.join(" · ")}`,
    ].filter(Boolean).join("\n");
    out.push({
      title,
      company: r.company_name?.trim() || "Simplify",
      location,
      remote: guessRemote(location),
      url: r.url,
      source: "simplify" as SourceKind,
      type: list === "intern" ? guessType(`${title} internship`) : guessType(title),
      description,
      tags: extractTags(`${title} ${r.category ?? ""}`),
      posted_at: r.date_posted ? normalizeDate(r.date_posted * 1000) : null,
      deadline: null,
    });
  }
  return out;
}

// ponytail: one process-wide copy plus a kv copy; the file is re-read at most every 12 h per list.
const memory = new Map<List, { at: number; jobs: NewJob[] }>();

async function rowsOf(list: List): Promise<{ jobs: NewJob[]; error?: string }> {
  const now = Date.now();
  const hit = memory.get(list);
  if (hit && now - hit.at < TTL_MS) return { jobs: hit.jobs };
  const key = `simplify_cache_${list}`;
  // Imported lazily so tests and client bundles never open the database.
  const db = await import("../db").catch(() => null);
  let stored: { at: number; jobs: NewJob[] } | null = null;
  try {
    stored = db?.kvGet<{ at: number; jobs: NewJob[] } | null>(key, null) ?? null;
  } catch {
    // no database (script, test): memory only
  }
  if (stored && now - stored.at < TTL_MS) {
    memory.set(list, stored);
    return { jobs: stored.jobs };
  }
  const { text, error } = await getText(LISTS[list], "application/json", { timeoutMs: 60_000 });
  if (error) return { jobs: stored?.jobs ?? [], error };
  let jobs: NewJob[];
  try {
    jobs = mapSimplify(JSON.parse(text) as SimplifyRow[], list);
  } catch {
    return { jobs: stored?.jobs ?? [], error: `Invalid JSON from ${LISTS[list]}` };
  }
  const entry = { at: now, jobs };
  memory.set(list, entry);
  try {
    db?.kvSet(key, entry);
  } catch {
    // memory copy still serves this process
  }
  return { jobs };
}

/** Handle: "" = both lists, "intern" or "newgrad". Keywords filter titles and categories locally. */
export async function scan(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const h = handle.trim().toLowerCase();
  const lists: List[] = h === "intern" || h === "newgrad" ? [h] : ["intern", "newgrad"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const l of lists) {
    const r = await rowsOf(l);
    jobs.push(...r.jobs);
    error ??= r.error;
  }
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  const kept = jobs
    .filter((j) => matchesKeywords(`${j.title} ${j.description.split("\n")[0]}`, words))
    .sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""))
    .slice(0, MAX_OUT);
  return { jobs: kept, error: jobs.length ? undefined : error };
}
