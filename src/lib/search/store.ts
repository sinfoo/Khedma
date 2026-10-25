// Search persistence: relevance on the job row, dedupe / recheck policy, known-offer index. Server only.
import { db, kvGet, kvSet, migrate, type NewJob } from "../db";
import { dedupeKey } from "../sources/classify";
import { fold } from "./filter";
import { normalizePrefs, type SearchPrefs } from "./prefs";
import { companyKey } from "./rank";

type Row = Record<string, unknown>;

export function ensureSearchSchema(): void {
  migrate(
    "search:001-relevance",
    `ALTER TABLE jobs ADD COLUMN relevance INTEGER;
     ALTER TABLE jobs ADD COLUMN match_why TEXT NOT NULL DEFAULT '[]';
     ALTER TABLE sources ADD COLUMN company INTEGER NOT NULL DEFAULT 0;`,
  );
  migrate(
    "search:002-trust",
    `ALTER TABLE jobs ADD COLUMN trust_score INTEGER;
     ALTER TABLE jobs ADD COLUMN trust_flags TEXT NOT NULL DEFAULT '[]';`,
  );
  // Every posting URL seen per role, so a role reposted under new URLs can be counted (the dedupe skips the copies).
  migrate("search:003-sightings", "CREATE TABLE IF NOT EXISTS job_sightings (key TEXT NOT NULL, url TEXT NOT NULL, PRIMARY KEY (key, url)) WITHOUT ROWID;");
  // When an offer was dismissed, so a role dismissed yesterday stays out even if it was first stored long ago.
  // Offers archived before this column existed count as archived now (they stay out for one recheck window).
  migrate(
    "search:004-archived-at",
    `ALTER TABLE jobs ADD COLUMN archived_at TEXT;
     UPDATE jobs SET archived_at = datetime('now') WHERE archived = 1;
     CREATE TRIGGER IF NOT EXISTS jobs_archived_at AFTER UPDATE OF archived ON jobs WHEN NEW.archived = 1 AND OLD.archived = 0
     BEGIN UPDATE jobs SET archived_at = datetime('now') WHERE id = NEW.id; END;`,
  );
}

/** Distinct posting URLs per role (dedupeKey), from stored offers and copies the dedupe skipped. */
export function postingCounts(): Map<string, number> {
  ensureSearchSchema();
  const urls = new Map<string, Set<string>>();
  const add = (key: string, url: string) => urls.set(key, (urls.get(key) ?? new Set()).add(url));
  for (const r of db().prepare("SELECT key, url FROM job_sightings").all() as Row[]) add(r.key as string, r.url as string);
  for (const r of db().prepare("SELECT company, title, url FROM jobs").all() as Row[]) add(dedupeKey(r.company as string, r.title as string), r.url as string);
  return new Map([...urls].map(([k, v]) => [k, v.size]));
}

export function setRelevance(jobId: number, score: number, why: string[]): void {
  ensureSearchSchema();
  db().prepare("UPDATE jobs SET relevance = ?, match_why = ? WHERE id = ?").run(Math.max(0, Math.min(100, Math.round(score))), JSON.stringify(why.slice(0, 12)), jobId);
}

export function setTrust(jobId: number, score: number, flags: string[]): void {
  ensureSearchSchema();
  db().prepare("UPDATE jobs SET trust_score = ?, trust_flags = ? WHERE id = ?").run(Math.max(0, Math.min(100, Math.round(score))), JSON.stringify(flags.slice(0, 12)), jobId);
}

// ---------- work preferences ----------
const PREFS_KEY = "search:prefs";
export function getSearchPrefs(): SearchPrefs {
  return normalizePrefs(kvGet<unknown>(PREFS_KEY, {}));
}
export function setSearchPrefs(patch: Partial<SearchPrefs>): SearchPrefs {
  const next = normalizePrefs({ ...getSearchPrefs(), ...patch });
  kvSet(PREFS_KEY, next);
  return next;
}

/** Companies (normalized) with an application already, for the "already applied here" chip. */
export function appliedCompanies(): Set<string> {
  const rows = db().prepare("SELECT DISTINCT j.company FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.status IN ('applied','responded','interview','offer','hired')").all() as Row[];
  return new Set(rows.map((r) => companyKey(r.company as string)));
}

// ---------- scan-history policy (career-ops `scan_history`) ----------
export interface SearchSettings {
  /** An archived role (same company + title) may come back after this many days. 0 = never. */
  recheck_after_days: number;
  /** Treat "Dev — Tunis" and "Dev — Sfax" as two roles. */
  dedup_include_location: boolean;
}
const KEY = "settings:search";
export const DEFAULT_SEARCH_SETTINGS: SearchSettings = { recheck_after_days: 30, dedup_include_location: false };

export function getSearchSettings(): SearchSettings {
  const v = kvGet<Partial<SearchSettings>>(KEY, {});
  const days = Number(v.recheck_after_days);
  return { recheck_after_days: Number.isFinite(days) && days >= 0 ? Math.min(365, Math.round(days)) : 30, dedup_include_location: v.dedup_include_location === true };
}

export function setSearchSettings(s: Partial<SearchSettings>): void {
  kvSet(KEY, { ...getSearchSettings(), ...s });
}

/** Cross-source key: company + title (+ location when `dedup_include_location`). */
export function historyKey(job: Pick<NewJob, "company" | "title" | "location">, includeLocation: boolean): string {
  const base = dedupeKey(job.company, job.title);
  return includeLocation ? `${base}|${fold(job.location).replace(/[^a-z0-9]+/g, " ").trim()}` : base;
}

/** SQLite's datetime('now') is UTC without a zone marker. */
const sqliteTime = (s: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`).getTime();

export interface KnownIndex {
  /** Already stored (by URL) or still deduped (by company + title). */
  has: (job: NewJob) => boolean;
  add: (job: NewJob) => void;
  /** Same role already listed by another board during this search. */
  seen: Set<string>;
}

/**
 * URLs of every stored offer block forever (the row exists). Company + title keys block while the
 * offer is open, for `recheck_after_days` after it was archived, and forever when a liveness check
 * found the posting closed.
 */
export function knownIndex(settings: SearchSettings = getSearchSettings()): KnownIndex {
  ensureSearchSchema();
  const d = db();
  const hasChecks = !!d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'job_checks'").get();
  const rows = d
    .prepare(
      `SELECT j.url, j.company, j.title, j.location, j.archived, COALESCE(j.archived_at, j.created_at) AS created_at${hasChecks ? ", c.status AS liveness" : ", NULL AS liveness"}
       FROM jobs j${hasChecks ? " LEFT JOIN job_checks c ON c.job_id = j.id" : ""}`,
    )
    .all() as Row[];
  const urls = new Set<string>();
  const keys = new Set<string>();
  const cutoff = Date.now() - settings.recheck_after_days * 86_400_000;
  for (const r of rows) {
    urls.add(r.url as string);
    const job = { company: r.company as string, title: r.title as string, location: (r.location as string) ?? "" };
    const dead = r.liveness === "closed";
    const recent = settings.recheck_after_days === 0 || sqliteTime(String(r.created_at)) >= cutoff;
    if (!r.archived || dead || recent) keys.add(historyKey(job, settings.dedup_include_location));
  }
  const seen = new Set<string>();
  const sight = d.prepare("INSERT OR IGNORE INTO job_sightings (key, url) VALUES (?, ?)");
  const note = (j: NewJob) => sight.run(dedupeKey(j.company, j.title), j.url);
  return {
    has: (j) => {
      const hit = urls.has(j.url) || keys.has(historyKey(j, settings.dedup_include_location));
      if (hit) note(j);
      return hit;
    },
    add: (j) => {
      note(j);
      urls.add(j.url);
      keys.add(historyKey(j, settings.dedup_include_location));
    },
    seen,
  };
}
