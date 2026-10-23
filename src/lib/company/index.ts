// Company area: profiles derived from offers, user preferences (rating, notes, blacklist), research cache, liveness checks.
import { db, listJobs, migrate, type JobWithMeta } from "@/lib/db";
import type { AppState } from "@/lib/types";
import { extractSkills } from "@/lib/ai/heuristic";
import { canonicalName, companySlug } from "./normalize";
import { canonicalPostingUrl } from "@/lib/sources/url";

export { normalizeCompany, companySlug, canonicalName } from "./normalize";

export const RESEARCH_TTL_DAYS = 14;

export interface CompanyFacts {
  description: string;
  sector: string;
  size: string;
  hq: string;
  tech: string[];
  social: Record<string, string>;
  culture: string[];
  pages: string[];
  excerpt: string;
}

export interface CompanySummary {
  what: string;
  lookFor: string;
  standOut: string[];
  questions: string[];
  engine: string;
}

export interface Research {
  facts: CompanyFacts;
  summary: CompanySummary;
  locale: string;
  error?: string;
}

export interface Company {
  slug: string;
  name: string;
  website: string;
  careers_url: string;
  sector: string;
  size: string;
  hq: string;
  description: string;
  notes: string;
  rating: number; // 0 = unrated, 1-5
  blacklisted: boolean;
  blacklist_reason: string;
  researched_at: string | null;
  research: Research | null;
}

export interface CompanyStats {
  open: number;
  total: number;
  types: Record<string, number>;
  locations: string[];
  skills: { name: string; n: number }[];
  avgFit: number | null;
  applications: number;
  outcomes: Partial<Record<AppState, number>>;
  firstSeen: string;
  lastSeen: string;
}

export type CompanyRow = Company & CompanyStats;

export type Liveness = "open" | "closed" | "unknown";
export interface JobCheck {
  job_id: number;
  status: Liveness;
  http_status: number | null;
  reason: string;
  checked_at: string;
}

type Row = Record<string, unknown>;

function ensureSchema() {
  migrate(
    "company:001-companies",
    `CREATE TABLE IF NOT EXISTS companies (
       slug TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       website TEXT NOT NULL DEFAULT '',
       careers_url TEXT NOT NULL DEFAULT '',
       sector TEXT NOT NULL DEFAULT '',
       size TEXT NOT NULL DEFAULT '',
       hq TEXT NOT NULL DEFAULT '',
       description TEXT NOT NULL DEFAULT '',
       notes TEXT NOT NULL DEFAULT '',
       rating INTEGER NOT NULL DEFAULT 0,
       blacklisted INTEGER NOT NULL DEFAULT 0,
       blacklist_reason TEXT NOT NULL DEFAULT '',
       researched_at TEXT,
       research TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     );`,
  );
  migrate(
    "company:002-job-checks",
    `CREATE TABLE IF NOT EXISTS job_checks (
       job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
       status TEXT NOT NULL,
       http_status INTEGER,
       reason TEXT NOT NULL DEFAULT '',
       checked_at TEXT NOT NULL DEFAULT (datetime('now'))
     );`,
  );
}

const parseResearch = (s: unknown): Research | null => {
  try {
    return s ? (JSON.parse(String(s)) as Research) : null;
  } catch {
    return null;
  }
};

const rowToCompany = (r: Row): Company => ({
  slug: r.slug as string,
  name: r.name as string,
  website: r.website as string,
  careers_url: r.careers_url as string,
  sector: r.sector as string,
  size: r.size as string,
  hq: r.hq as string,
  description: r.description as string,
  notes: r.notes as string,
  rating: Number(r.rating) || 0,
  blacklisted: !!r.blacklisted,
  blacklist_reason: r.blacklist_reason as string,
  researched_at: (r.researched_at as string) ?? null,
  research: parseResearch(r.research),
});

// ---------- grouping offers per company ----------
function allJobs(): JobWithMeta[] {
  return [...listJobs({ archived: false }), ...listJobs({ archived: true })];
}

function groupJobs(jobs: JobWithMeta[]): Map<string, JobWithMeta[]> {
  const out = new Map<string, JobWithMeta[]>();
  for (const j of jobs) {
    const slug = companySlug(j.company);
    if (!slug) continue;
    out.set(slug, [...(out.get(slug) ?? []), j]);
  }
  return out;
}

/** Most frequent spelling in the offers, nicest-cased. */
function pickName(jobs: JobWithMeta[]): string {
  const counts = new Map<string, number>();
  for (const j of jobs) counts.set(j.company.trim(), (counts.get(j.company.trim()) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? jobs[0].company;
  return canonicalName(best);
}

export function statsFor(jobs: JobWithMeta[]): CompanyStats {
  const open = jobs.filter((j) => !j.archived);
  const types: Record<string, number> = {};
  const locs = new Map<string, number>();
  const skills = new Map<string, number>();
  const outcomes: Partial<Record<AppState, number>> = {};
  const scores: number[] = [];
  let applications = 0;
  for (const j of jobs) {
    types[j.type] = (types[j.type] ?? 0) + 1;
    const loc = j.remote && !j.location ? "Remote" : j.location.trim();
    if (loc) locs.set(loc, (locs.get(loc) ?? 0) + 1);
    for (const s of new Set([...extractSkills(`${j.title}\n${j.tags.join(", ")}\n${j.description}`)])) skills.set(s, (skills.get(s) ?? 0) + 1);
    if (j.evaluation) scores.push(j.evaluation.global);
    if (j.application) {
      applications++;
      outcomes[j.application.status] = (outcomes[j.application.status] ?? 0) + 1;
    }
  }
  const dates = jobs.map((j) => j.posted_at ?? j.created_at).sort();
  return {
    open: open.length,
    total: jobs.length,
    types,
    locations: [...locs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l]) => l),
    skills: [...skills.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, n]) => ({ name, n })),
    avgFit: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    applications,
    outcomes,
    firstSeen: dates[0] ?? "",
    lastSeen: dates[dates.length - 1] ?? "",
  };
}

/** Make sure every employer seen in the offers has a companies row. Cheap: INSERT OR IGNORE per slug. */
function syncCompanies(groups: Map<string, JobWithMeta[]>): void {
  const ins = db().prepare("INSERT OR IGNORE INTO companies (slug, name) VALUES (?, ?)");
  for (const [slug, jobs] of groups) ins.run(slug, pickName(jobs));
}

function loadAll(): { rows: Map<string, Company>; groups: Map<string, JobWithMeta[]> } {
  ensureSchema();
  const groups = groupJobs(allJobs());
  syncCompanies(groups);
  const rows = new Map<string, Company>();
  for (const r of db().prepare("SELECT * FROM companies").all() as Row[]) rows.set(r.slug as string, rowToCompany(r));
  return { rows, groups };
}

export function listCompanies(): CompanyRow[] {
  const { rows, groups } = loadAll();
  return [...rows.values()].map((c) => ({ ...c, ...statsFor(groups.get(c.slug) ?? []) })).sort((a, b) => b.open - a.open || b.lastSeen.localeCompare(a.lastSeen) || a.name.localeCompare(b.name));
}

export function getCompany(slug: string): CompanyRow | null {
  const { rows, groups } = loadAll();
  const c = rows.get(slug);
  return c ? { ...c, ...statsFor(groups.get(slug) ?? []) } : null;
}

/** All offers of a company, open first, newest first. */
export function companyJobs(slug: string): JobWithMeta[] {
  return (groupJobs(allJobs()).get(slug) ?? []).sort((a, b) => Number(a.archived) - Number(b.archived) || b.created_at.localeCompare(a.created_at));
}

export type CompanyPatch = Partial<Pick<Company, "website" | "careers_url" | "sector" | "size" | "hq" | "description" | "notes" | "rating" | "blacklisted" | "blacklist_reason" | "researched_at" | "research">>;

export function updateCompany(slug: string, patch: CompanyPatch): void {
  ensureSchema();
  const cur = db().prepare("SELECT * FROM companies WHERE slug = ?").get(slug) as Row | undefined;
  if (!cur) return;
  const n = { ...rowToCompany(cur), ...patch };
  db()
    .prepare(
      `UPDATE companies SET website=?, careers_url=?, sector=?, size=?, hq=?, description=?, notes=?, rating=?, blacklisted=?, blacklist_reason=?, researched_at=?, research=? WHERE slug=?`,
    )
    .run(
      n.website,
      n.careers_url,
      n.sector,
      n.size,
      n.hq,
      n.description,
      n.notes,
      n.rating,
      n.blacklisted ? 1 : 0,
      n.blacklist_reason,
      n.researched_at,
      n.research ? JSON.stringify(n.research) : null,
      slug,
    );
}

// ---------- blacklist (for the offers / sources areas) ----------
export function blacklistedSlugs(): string[] {
  ensureSchema();
  return (db().prepare("SELECT slug FROM companies WHERE blacklisted = 1").all() as Row[]).map((r) => r.slug as string);
}

/** True when the employer (raw name as written on an offer) is blacklisted. */
export function isBlacklisted(company: string): boolean {
  const slug = companySlug(company);
  if (!slug) return false;
  ensureSchema();
  return !!db().prepare("SELECT 1 FROM companies WHERE slug = ? AND blacklisted = 1").get(slug);
}

// ---------- liveness checks ----------
export function saveCheck(c: Omit<JobCheck, "checked_at">): JobCheck {
  ensureSchema();
  db()
    .prepare(
      `INSERT INTO job_checks (job_id, status, http_status, reason, checked_at) VALUES (?,?,?,?,datetime('now'))
       ON CONFLICT(job_id) DO UPDATE SET status=excluded.status, http_status=excluded.http_status, reason=excluded.reason, checked_at=excluded.checked_at`,
    )
    .run(c.job_id, c.status, c.http_status, c.reason);
  return db().prepare("SELECT * FROM job_checks WHERE job_id = ?").get(c.job_id) as unknown as JobCheck;
}

/**
 * After a complete listing of one board: its stored offers that are no longer listed are closed (check + archived;
 * tracked ones stay in the pipeline with the closed mark), and closed ones that came back are open again.
 * Returns the ids closed now.
 */
export function syncBoard(source: string, listed: { urls: string[]; companies: string[] }): number[] {
  ensureSchema();
  if (!listed.urls.length || !listed.companies.length) return [];
  const live = new Set(listed.urls.map(canonicalPostingUrl));
  const rows = db()
    .prepare(
      `SELECT j.id, j.url, j.archived, c.status, (SELECT 1 FROM applications a WHERE a.job_id = j.id) AS tracked
       FROM jobs j LEFT JOIN job_checks c ON c.job_id = j.id
       WHERE j.source = ? AND j.company IN (${listed.companies.map(() => "?").join(",")})`,
    )
    .all(source, ...listed.companies) as Row[];
  const closed: number[] = [];
  for (const r of rows) {
    const id = r.id as number;
    const isLive = live.has(canonicalPostingUrl(r.url as string));
    if (!isLive && r.status !== "closed") {
      saveCheck({ job_id: id, status: "closed", http_status: null, reason: "no longer listed on the employer's board" });
      if (!r.tracked && !r.archived) db().prepare("UPDATE jobs SET archived = 1 WHERE id = ?").run(id);
      closed.push(id);
    } else if (isLive && r.status === "closed") {
      saveCheck({ job_id: id, status: "open", http_status: null, reason: "listed again on the employer's board" });
    }
  }
  return closed;
}

export function getChecks(ids: number[]): Map<number, JobCheck> {
  ensureSchema();
  const out = new Map<number, JobCheck>();
  if (!ids.length) return out;
  const rows = db().prepare(`SELECT * FROM job_checks WHERE job_id IN (${ids.map(() => "?").join(",")})`).all(...ids) as unknown as JobCheck[];
  for (const r of rows) out.set(r.job_id, r);
  return out;
}
