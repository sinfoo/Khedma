// Sources area data access: per-source scan config, scan runs history, auto-scan setting
// and the scan orchestrator shared by the streaming route and the server actions.
import { getProfileExtra } from "../cv/profile-extra";
import { db, getProfile, kvGet, kvSet, migrate, updateJob, upsertJob } from "../db";
import type { JobType, Profile } from "../types";
import { CATALOG, dedupeKey, detectAts, scanSource, type ProviderKind, type ScanOptions, type ScanResult } from "../sources";
import { mapLimit } from "../sources/http";
import { trustScore, type HostClass } from "../sources/trust";
import { checkJobs } from "../company/liveness";
import { planSearch, planSources, type PlanRun, type PlanSkipped, type Remote } from "../search/plan";
import { buildFilter, compileKeyword, fold } from "../search/filter";
import { companyKey, scoreJob, type RankContext } from "../search/rank";
import { appliedCompanies, ensureSearchSchema, getSearchPrefs, knownIndex, setRelevance, setTrust } from "../search/store";
import { buildTiers, type Tier, type Tiers } from "../search/tiers";
import { sweep } from "../search/sweep";
import { extractSkills } from "../ai/heuristic";
import { cvForMatching } from "./offers";

export { getSearchPrefs, setSearchPrefs } from "../search/store";
export { sweep } from "../search/sweep";

type Row = Record<string, unknown>;

function ensure() {
  ensureSearchSchema();
  migrate(
    "sources:001-config-and-runs",
    `ALTER TABLE sources ADD COLUMN keywords TEXT NOT NULL DEFAULT '';
     ALTER TABLE sources ADD COLUMN keep_all INTEGER NOT NULL DEFAULT 0;
     ALTER TABLE sources ADD COLUMN last_error TEXT;
     ALTER TABLE sources ADD COLUMN last_total INTEGER NOT NULL DEFAULT 0;
     CREATE TABLE IF NOT EXISTS scan_runs (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       started_at TEXT NOT NULL,
       finished_at TEXT,
       trigger TEXT NOT NULL DEFAULT 'manual',
       sources INTEGER NOT NULL DEFAULT 0,
       listed INTEGER NOT NULL DEFAULT 0,
       matched INTEGER NOT NULL DEFAULT 0,
       added INTEGER NOT NULL DEFAULT 0,
       duplicates INTEGER NOT NULL DEFAULT 0,
       errors INTEGER NOT NULL DEFAULT 0,
       new_job_ids TEXT NOT NULL DEFAULT '[]',
       detail TEXT NOT NULL DEFAULT '[]'
     );
     CREATE INDEX IF NOT EXISTS scan_runs_started ON scan_runs(started_at DESC);`,
  );
}

// ---------- sources ----------
export interface SourceRow {
  id: number;
  kind: ProviderKind;
  label: string;
  handle: string;
  enabled: boolean;
  keywords: string[];
  keep_all: boolean;
  last_scan: string | null;
  last_count: number;
  last_total: number;
  last_error: string | null;
  /** Tracked company (career board / careers page) rather than a job board. */
  company: boolean;
}

const toSource = (r: Row): SourceRow => ({
  id: r.id as number,
  kind: r.kind as ProviderKind,
  label: r.label as string,
  handle: r.handle as string,
  enabled: !!r.enabled,
  keywords: String(r.keywords ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  keep_all: !!r.keep_all,
  last_scan: (r.last_scan as string) ?? null,
  last_count: (r.last_count as number) ?? 0,
  last_total: (r.last_total as number) ?? 0,
  last_error: (r.last_error as string) ?? null,
  company: !!r.company,
});

export function listSourceRows(): SourceRow[] {
  ensure();
  return (db().prepare("SELECT * FROM sources ORDER BY id").all() as Row[]).map(toSource);
}

export function getSourceRow(id: number): SourceRow | null {
  ensure();
  const r = db().prepare("SELECT * FROM sources WHERE id = ?").get(id) as Row | undefined;
  return r ? toSource(r) : null;
}

export interface SourceInput {
  kind: ProviderKind;
  label: string;
  handle: string;
  keywords: string[];
  keep_all: boolean;
  company?: boolean;
}

/** Returns the new id, or null when the same board (kind + handle) is already there. */
export function createSourceRow(s: SourceInput): number | null {
  ensure();
  const res = db()
    .prepare("INSERT OR IGNORE INTO sources (kind, label, handle, keywords, keep_all, company) VALUES (?,?,?,?,?,?)")
    .run(s.kind, s.label, s.handle, s.keywords.join(", "), s.keep_all ? 1 : 0, s.company ? 1 : 0);
  return res.changes ? Number(res.lastInsertRowid) : null;
}

export function updateSourceRow(id: number, p: Partial<Pick<SourceRow, "label" | "keywords" | "keep_all" | "enabled">>): void {
  const cur = getSourceRow(id);
  if (!cur) return;
  const n = { ...cur, ...p };
  db()
    .prepare("UPDATE sources SET label=?, keywords=?, keep_all=?, enabled=? WHERE id=?")
    .run(n.label, n.keywords.join(", "), n.keep_all ? 1 : 0, n.enabled ? 1 : 0, id);
}

/** Skills the profile lists plus the ones found in the CV text, profile order first. */
const LANGUAGE_WORDS = new Set(["arabic", "arabe", "french", "francais", "français", "english", "anglais", "german", "allemand", "spanish", "espagnol", "italian", "italien"]);
export function cvSkills(profile: Profile, cvText = profile.cv_md): string[] {
  // Spoken languages are listed as skills by some profiles; they make poor board queries.
  return [...new Set([...profile.skills, ...extractSkills(cvText)].map((k) => k.trim()).filter((k) => k && !LANGUAGE_WORDS.has(k.toLowerCase())))];
}

/**
 * Keywords used when the user types none: the head word of each target role, the first skills of the CV,
 * then the internship kinds. Boards phrase-match keywords; the profile filter narrows the results afterwards.
 */
export function defaultKeywords(profile: Profile, cvText = profile.cv_md): string[] {
  const kinds = profile.target_types.filter((t) => t === "stage" || t === "pfe" || t === "alternance");
  // "Développeur full stack" -> "développeur", "Data analyst" -> "data".
  const roles = profile.target_roles.map((r) => r.trim().split(/\s+/)[0]).filter((w) => w && w.length >= 3);
  const skills = cvSkills(profile, cvText).slice(0, 3);
  return [...new Set([...roles, ...skills, ...kinds].map((k) => k.toLowerCase()))].slice(0, 6);
}

// ---------- auto-scan ----------
export interface AutoScan {
  enabled: boolean;
  hours: number;
}
const AUTO_KEY = "settings:autoscan";
export const AUTO_HOURS = [1, 3, 6, 12, 24] as const;

export function getAutoScan(): AutoScan {
  const v = kvGet<Partial<AutoScan>>(AUTO_KEY, {});
  const hours = AUTO_HOURS.includes(v.hours as (typeof AUTO_HOURS)[number]) ? (v.hours as number) : 6;
  return { enabled: !!v.enabled, hours };
}

export function setAutoScan(v: AutoScan): void {
  kvSet(AUTO_KEY, v);
}

export function lastRunAt(): string | null {
  ensure();
  const r = db().prepare("SELECT started_at FROM scan_runs ORDER BY started_at DESC LIMIT 1").get() as Row | undefined;
  return (r?.started_at as string) ?? null;
}

export function autoScanDue(now = Date.now()): boolean {
  const a = getAutoScan();
  if (!a.enabled) return false;
  const last = lastRunAt();
  return !last || now - new Date(last).getTime() >= a.hours * 3_600_000;
}

// ---------- runs ----------
export interface RunSourceDetail {
  /** Saved source id, 0 for a catalog run. */
  id: number;
  key?: string;
  label: string;
  listed: number;
  matched: number;
  /** Offers that passed the filter and were not already known. */
  kept?: number;
  added: number;
  known: number;
  dropped?: Record<string, number>;
  error?: string;
  ms: number;
}

export interface ScanRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  trigger: "manual" | "auto";
  sources: number;
  listed: number;
  matched: number;
  added: number;
  duplicates: number;
  errors: number;
  new_job_ids: number[];
  detail: RunSourceDetail[];
}

const parse = <T>(s: unknown, fb: T): T => {
  try {
    return s ? (JSON.parse(String(s)) as T) : fb;
  } catch {
    return fb;
  }
};

const toRun = (r: Row): ScanRun => ({
  id: r.id as number,
  started_at: r.started_at as string,
  finished_at: (r.finished_at as string) ?? null,
  trigger: r.trigger === "auto" ? "auto" : "manual",
  sources: r.sources as number,
  listed: r.listed as number,
  matched: r.matched as number,
  added: r.added as number,
  duplicates: r.duplicates as number,
  errors: r.errors as number,
  new_job_ids: parse<number[]>(r.new_job_ids, []),
  detail: parse<RunSourceDetail[]>(r.detail, []),
});

export function listRuns(limit = 10): ScanRun[] {
  ensure();
  return (db().prepare("SELECT * FROM scan_runs ORDER BY started_at DESC, id DESC LIMIT ?").all(limit) as Row[]).map(toRun);
}

export interface Discovered {
  id: number;
  title: string;
  company: string;
  location: string;
  type: string;
  source: string;
  created_at: string;
}

/** Latest offers added by scans (still present and not archived), newest first. */
export function listDiscovered(limit = 8): Discovered[] {
  const ids = listRuns(20).flatMap((r) => [...r.new_job_ids].reverse()).slice(0, 200);
  if (!ids.length) return [];
  const rows = db()
    .prepare(`SELECT id, title, company, location, type, source, created_at FROM jobs WHERE archived = 0 AND id IN (${ids.map(() => "?").join(",")}) ORDER BY id DESC LIMIT ?`)
    .all(...ids, limit) as Row[];
  // node:sqlite rows have a null prototype; React only serializes plain objects.
  return rows.map((r) => ({ ...r }) as unknown as Discovered);
}

// ---------- scan orchestrator ----------
export interface FoundJob {
  id: number;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  type: string;
  url: string;
  source: string;
  deadline: string | null;
  relevance: number;
  why: string[];
  trust: number;
  trustFlags: string[];
  host: HostClass;
  queryTier: Tier;
  /** You already applied at this company (work preference "apply once"). */
  appliedHere: boolean;
}

export type ScanEvent =
  | { type: "plan"; run_id: number; runs: PlanRun[]; skipped: PlanSkipped[]; skipped_blacklist: number }
  | { type: "source"; key: string; id?: number; status: "running" }
  | ({ type: "source"; status: "done" | "error" } & RunSourceDetail)
  | { type: "job"; job: FoundJob }
  | { type: "liveness"; checked: number; closed: number[] }
  | { type: "sweep"; urgent: number; merged: number; expired: number }
  | { type: "done"; run_id: number; added: number; errors: number; duplicates: number; dropped: Record<string, number>; closed: number; jobs: { id: number; title: string; company: string }[] };

export interface ScanRequest {
  /** Explicit sources (Sources page): they all run, whatever the countries. */
  ids?: number[];
  trigger?: "manual" | "auto";
  onEvent?: (e: ScanEvent) => void;
  keywords?: string[];
  countries?: string[];
  remote?: Remote;
  types?: JobType[];
  negatives?: string[];
  includeSenior?: boolean;
}

declare global {
  var __khedmaScanBusy: boolean | undefined;
}

export const scanBusy = () => !!globalThis.__khedmaScanBusy;

const LIVENESS_TOP = 20;
const TIER_MIN: Record<Tier, number> = { 1: 10, 2: 3, 3: 0 };

/** Query a keyword board tier by tier until it answers with enough listings; other boards run once. */
async function scanTiered(run: PlanRun, profile: Profile, tiers: Tiers, opts: Omit<ScanOptions, "keywords">): Promise<ScanResult & { tierOf: Map<string, Tier> }> {
  const usesKeywords = CATALOG.find((c) => c.kind === run.kind)?.keywords ?? false;
  const tierOf = new Map<string, Tier>();
  let out: ScanResult = { jobs: [], total: 0, matched: 0, known: 0, dropped: {} };
  const order: Tier[] = usesKeywords ? [1, 2, 3] : [1];
  for (const t of order) {
    const keywords = t === 1 ? run.keywords : tiers[t];
    if (t > 1 && (out.total >= TIER_MIN[(t - 1) as Tier] || !keywords.length)) break;
    const r = await scanSource(run, profile, { ...opts, keywords });
    for (const j of r.jobs) if (!tierOf.has(j.url)) tierOf.set(j.url, t);
    const seen = new Set(out.jobs.map((j) => j.url));
    out = {
      jobs: [...out.jobs, ...r.jobs.filter((j) => !seen.has(j.url))],
      total: out.total + r.total,
      matched: out.matched + r.matched,
      known: out.known + r.known,
      dropped: Object.fromEntries([...new Set([...Object.keys(out.dropped), ...Object.keys(r.dropped)])].map((k) => [k, (out.dropped[k] ?? 0) + (r.dropped[k] ?? 0)])),
      error: r.error ?? out.error,
    };
  }
  return { ...out, tierOf };
}

/**
 * Search: plan the runs from the chosen countries (or the explicit ids), scan 3 boards at a time,
 * filter + rank each offer, stream events, check liveness of the best new offers, sweep, record one
 * scan_runs row. Returns null when another scan is running.
 */
export async function runScan(opts: ScanRequest = {}): Promise<ScanRun | null> {
  if (globalThis.__khedmaScanBusy) return null;
  globalThis.__khedmaScanBusy = true;
  try {
    ensure();
    const emit = opts.onEvent ?? (() => {});
    const profile = getProfile();
    const extra = getProfileExtra();
    const prefs = getSearchPrefs();
    const all = listSourceRows();
    const keywords = opts.keywords ?? [];
    const cvText = cvForMatching().text;
    const skills = cvSkills(profile, cvText);
    const countries = opts.countries?.length ? opts.countries : extra.places.countries;
    const places = { countries, cities: countries.includes("TN") ? extra.places.cities : [], remote: opts.remote ?? extra.places.remote };
    const missingEnv = CATALOG.filter((c) => c.needsEnv?.some((n) => !process.env[n]?.trim())).map((c) => c.kind);
    const plan = opts.ids?.length
      ? planSources(all.filter((s) => opts.ids!.includes(s.id)), keywords, defaultKeywords(profile, cvText))
      : planSearch({ keywords, countries: places.countries, cities: places.cities, remote: places.remote, enabledSources: all, missingEnv, defaultKeywords: defaultKeywords(profile, cvText) });
    // Blacklisted employers never run as tracked companies.
    const blocked = prefs.companyBlacklist.map((k) => compileKeyword(k));
    const runs = plan.runs.filter((r) => !(r.company && blocked.some((m) => m(fold(r.label)))));
    const skippedBlacklist = plan.runs.length - runs.length;

    const started = new Date().toISOString();
    const runId = Number(db().prepare("INSERT INTO scan_runs (started_at, trigger, sources) VALUES (?,?,?)").run(started, opts.trigger ?? "manual", runs.length).lastInsertRowid);
    emit({ type: "plan", run_id: runId, runs, skipped: plan.skipped, skipped_blacklist: skippedBlacklist });

    const filter = buildFilter({ keywords, profile, places, types: opts.types, extraNegatives: opts.negatives, includeSenior: opts.includeSenior, prefs });
    const tiers = buildTiers(keywords, profile.target_roles);
    const known = knownIndex();
    const tracked = new Set(all.filter((s) => s.company && s.enabled).map((s) => companyKey(s.label)));
    const applied = prefs.applyOnceAtCompany ? appliedCompanies() : new Set<string>();
    const rank: RankContext = { positives: filter.positives, keywords, types: filter.types, places, tracked, seen: known.seen, skills };
    const newIds: number[] = [];
    const found: FoundJob[] = [];
    const dropped: Record<string, number> = {};
    let duplicates = 0;

    const detail = await mapLimit(runs, 3, async (run): Promise<RunSourceDetail> => {
      emit({ type: "source", key: run.key, id: run.sourceId, status: "running" });
      const t0 = Date.now();
      let res: Awaited<ReturnType<typeof scanTiered>>;
      try {
        res = await scanTiered(run, profile, tiers, { keepAll: run.keepAll && !opts.keywords?.length, isKnown: known.has, places, decide: filter.decide });
      } catch (e) {
        res = { jobs: [], total: 0, matched: 0, known: 0, dropped: {}, tierOf: new Map(), error: (e as Error).message };
      }
      let added = 0;
      for (const j of res.jobs) {
        // A board scanned in parallel may have added the same offer a moment ago.
        if (known.has(j)) {
          duplicates++;
          continue;
        }
        const ranked = scoreJob(j, rank);
        const tier = res.tierOf.get(j.url) ?? 1;
        ranked.score = Math.min(100, ranked.score + (tier === 1 ? 6 : tier === 2 ? 3 : 0));
        if (tier === 1) ranked.why.push("tier:1");
        const trust = trustScore(j);
        const { id, inserted } = upsertJob(j);
        known.add(j);
        known.seen.add(dedupeKey(j.company, j.title));
        if (!inserted) {
          duplicates++;
          continue;
        }
        setRelevance(id, ranked.score, ranked.why);
        setTrust(id, trust.score, trust.flags);
        added++;
        newIds.push(id);
        const fj: FoundJob = {
          id, title: j.title, company: j.company, location: j.location, remote: j.remote, type: j.type, url: j.url, source: j.source, deadline: j.deadline,
          relevance: ranked.score, why: ranked.why, trust: trust.score, trustFlags: trust.flags, host: trust.host, queryTier: tier,
          appliedHere: applied.has(companyKey(j.company)),
        };
        found.push(fj);
        emit({ type: "job", job: fj });
      }
      duplicates += res.known;
      for (const [k, n] of Object.entries(res.dropped)) dropped[k] = (dropped[k] ?? 0) + n;
      const error = res.error && !res.jobs.length && !res.total ? res.error.slice(0, 300) : undefined;
      if (run.sourceId) db().prepare("UPDATE sources SET last_scan=?, last_count=?, last_total=?, last_error=? WHERE id=?").run(new Date().toISOString(), added, res.total, error ?? null, run.sourceId);
      const d: RunSourceDetail = { id: run.sourceId ?? 0, key: run.key, label: run.label, listed: res.total, matched: res.matched, kept: res.jobs.length, added, known: res.known, dropped: res.dropped, error, ms: Date.now() - t0 };
      emit({ type: "source", status: error ? "error" : "done", ...d });
      return d;
    });

    // Liveness: the best new offers are opened once; closed ones are archived with the check as the note.
    let closed: number[] = [];
    const top = [...found].sort((a, b) => b.relevance - a.relevance).slice(0, LIVENESS_TOP);
    if (top.length) {
      try {
        const checks = await checkJobs(top.map((j) => j.id));
        closed = checks.filter((c) => c.status === "closed").map((c) => c.job_id);
        for (const id of closed) updateJob(id, { archived: true });
        emit({ type: "liveness", checked: checks.length, closed });
      } catch (e) {
        console.warn("[search] liveness pass failed:", (e as Error).message);
      }
    }
    try {
      const sw = sweep();
      emit({ type: "sweep", urgent: sw.urgent.length, merged: sw.merged.length, expired: sw.expired.length });
    } catch (e) {
      console.warn("[search] sweep failed:", (e as Error).message);
    }

    const sum = (k: "listed" | "matched" | "added") => detail.reduce((a, d) => a + d[k], 0);
    const errors = detail.filter((d) => d.error).length;
    db()
      .prepare("UPDATE scan_runs SET finished_at=?, listed=?, matched=?, added=?, duplicates=?, errors=?, new_job_ids=?, detail=? WHERE id=?")
      .run(new Date().toISOString(), sum("listed"), sum("matched"), sum("added"), duplicates, errors, JSON.stringify(newIds), JSON.stringify(detail), runId);
    const best = found.filter((j) => !closed.includes(j.id)).sort((a, b) => b.relevance - a.relevance).slice(0, 8).map((j) => ({ id: j.id, title: j.title, company: j.company }));
    emit({ type: "done", run_id: runId, added: sum("added"), errors, duplicates, dropped, closed: closed.length, jobs: best });
    return listRuns(1)[0];
  } finally {
    globalThis.__khedmaScanBusy = false;
  }
}

/** Tracked company from a careers URL: detect the ATS, store it as a company source. */
export async function trackCompany(url: string, name?: string): Promise<{ ok: true; id: number; kind: string; label: string; ats?: string } | { ok: false; error: "invalid" | "unreachable" | "duplicate" }> {
  const d = await detectAts(url);
  if ("error" in d) return { ok: false, error: /Invalid|Private|Only http/.test(d.error) ? "invalid" : "unreachable" };
  const label = (name?.trim() || d.label || "").slice(0, 80) || d.handle;
  const id = createSourceRow({ kind: d.kind, label, handle: d.handle, keywords: [], keep_all: false, company: true });
  if (!id) return { ok: false, error: "duplicate" };
  return { ok: true, id, kind: d.kind, label, ats: d.ats };
}
