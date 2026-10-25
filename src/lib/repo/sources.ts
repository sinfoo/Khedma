// Sources area data access: per-source scan config, scan runs history, auto-scan setting
// and the scan orchestrator shared by the streaming route and the server actions.
import { getProfileExtra } from "../cv/profile-extra";
import { autoArchive, db, getProfile, kvGet, kvSet, latestEvaluation, listJobs, migrate, upsertJob, type NewJob } from "../db";
import { JOB_TYPES, type JobType, type Profile } from "../types";
import { CATALOG, dedupeKey, detectAts, scanSource, type ProviderKind, type ScanOptions, type ScanResult } from "../sources";
import { mapLimit, scanSignal } from "../sources/http";
import { trustScore, type HostClass } from "../sources/trust";
import { checkJobs } from "../company/liveness";
import { syncBoard } from "../company";
import { planSearch, planSources, type PlanRun, type PlanSkipped, type Remote } from "../search/plan";
import { buildFilter, compileKeyword, dropBucket, fold, type FilterOptions } from "../search/filter";
import { companyKey, scoreJob, type RankContext } from "../search/rank";
import { appliedCompanies, ensureSearchSchema, getSearchPrefs, knownIndex, setRelevance, setTrust, type KnownIndex } from "../search/store";
import type { SearchPrefs } from "../search/prefs";
import { missingKeyKinds } from "../provider-keys";
import { buildTiers, type Tier, type Tiers } from "../search/tiers";
import { cvKeywords, EVERYDAY_TOOLS } from "../search/cv-keywords";
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
  // A run left unfinished by a stopped or crashed server would read as "running" forever: close it, once per process.
  if (!globalThis.__khedmaStuckRunsClosed && !scanBusy()) {
    globalThis.__khedmaStuckRunsClosed = true;
    closeStuckRuns();
  }
}

/** Marks runs with no finish time (none can be running when this process has no scan) as finished with an error. */
export function closeStuckRuns(): number {
  return Number(db().prepare("UPDATE scan_runs SET finished_at = started_at, errors = errors + 1 WHERE finished_at IS NULL").run().changes);
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
// Soft skills sit in most CVs and most postings: as board queries or relevance boosts they match everything.
const SOFT_SKILLS = new Set(["communication", "creativity", "créativité", "creativite", "teamwork", "team work", "travail en équipe", "travail en equipe", "leadership", "autonomy", "autonomie", "rigueur", "curiosity", "curiosité", "adaptability", "adaptabilité", "problem solving", "problem-solving", "esprit d'équipe", "organisation", "time management"]);
export function cvSkills(profile: Profile, cvText = profile.cv_md): string[] {
  // Spoken languages and soft skills are listed as skills by many profiles; they make poor board queries.
  return [...new Set([...profile.skills, ...extractSkills(cvText)].map((k) => k.trim()).filter((k) => k && !LANGUAGE_WORDS.has(k.toLowerCase()) && !SOFT_SKILLS.has(k.toLowerCase())))];
}

/**
 * Keywords used when the user types none: the roles the CV shows (title, experience entries) and its main
 * skills (search/cv-keywords.ts). When the CV shows no role: the head word of each target role, the first
 * skills, then the internship kinds.
 * Boards phrase-match keywords; the profile filter narrows the results afterwards.
 */
export function defaultKeywords(profile: Profile, cvText = profile.cv_md): string[] {
  const fromCv = cvKeywords(cvText, profile.headline, cvSkills(profile, cvText));
  if (fromCv.roles.length) return fromCv.keywords;
  const kinds = profile.target_types.filter((t) => t === "stage" || t === "pfe" || t === "alternance");
  // "Développeur full stack" -> "développeur", "Data analyst" -> "data".
  const roles = profile.target_roles.map((r) => r.trim().split(/\s+/)[0]).filter((w) => w && w.length >= 3);
  // "c" or "r" as a board query matches everything; "github" or "jira" finds every job that uses them.
  const skills = cvSkills(profile, cvText).filter((k) => k.length >= 2 && !EVERYDAY_TOOLS.has(k.toLowerCase())).slice(0, 3);
  // Internship words only fill in when the CV gives almost nothing else to search for.
  const words = [...new Set([...roles, ...skills].map((k) => k.toLowerCase()))];
  return [...new Set([...words, ...(words.length < 2 ? kinds : [])])].slice(0, 6);
}

/** Profile countries plus the country of every enabled saved board: a board the user switched on is never skipped. */
export function searchCountries(base: string[], rows: SourceRow[] = listSourceRows()): string[] {
  const own = rows.filter((s) => s.enabled && !s.company).map((s) => CATALOG.find((c) => c.kind === s.kind)?.country as string | undefined);
  return [...new Set([...base, ...own.filter((c): c is string => !!c && c !== "INT")])];
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

// ---------- saved search options (Scan > Search options) ----------
export interface ScanOptionsSaved {
  types: JobType[];
  /** Words that drop an offer for this search ("excluded words"). */
  negatives: string[];
}
const OPTIONS_KEY = "settings:scan-options";

export function getScanOptions(): ScanOptionsSaved {
  const v = kvGet<Partial<ScanOptionsSaved>>(OPTIONS_KEY, {});
  return {
    types: [...new Set(Array.isArray(v.types) ? v.types : [])].filter((t): t is JobType => JOB_TYPES.includes(t as JobType)),
    negatives: (Array.isArray(v.negatives) ? v.negatives : []).map((x) => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 12),
  };
}

export function setScanOptions(v: ScanOptionsSaved): ScanOptionsSaved {
  kvSet(OPTIONS_KEY, v);
  return getScanOptions();
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
  /** Some offers came back but part of the source failed. */
  warning?: string;
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

/** Per saved source: how many of the last `n` scans read it without error, and the new offers it kept in them. */
export function sourceYield(n = 5): Record<number, { runs: number; kept: number }> {
  const out: Record<number, { runs: number; kept: number }> = {};
  for (const r of listRuns(n)) {
    for (const d of r.detail) {
      if (!d.id || d.error) continue;
      const y = (out[d.id] ??= { runs: 0, kept: 0 });
      y.runs++;
      y.kept += d.added;
    }
  }
  return out;
}

/** What the scan feed shows per offer, read from the database so a restored feed is never stale. */
export interface FeedRowState {
  /** Latest evaluation: its own verdict, engine and triage outcome. */
  ev: { global: number; verdict: "apply_now" | "apply" | "maybe" | "skip"; engine: string; triage?: { verdict: string; skipped: boolean; reason: string } } | null;
  appId: number | null;
  archived: boolean;
}

export function feedState(ids: number[]): Record<number, FeedRowState> {
  if (!ids.length) return {};
  const rows = db()
    .prepare(`SELECT j.id, j.archived, a.id AS app_id FROM jobs j LEFT JOIN applications a ON a.job_id = j.id WHERE j.id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as Row[];
  const out: Record<number, FeedRowState> = {};
  for (const r of rows) {
    const e = latestEvaluation(r.id as number);
    const tr = e?.triage;
    out[r.id as number] = {
      ev: e ? { global: e.global, verdict: e.verdict, engine: e.engine, triage: tr ? { verdict: tr.verdict, skipped: tr.skipped, reason: tr.reason } : undefined } : null,
      appId: (r.app_id as number) ?? null,
      archived: !!r.archived,
    };
  }
  return out;
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
  | { type: "plan"; run_id: number; runs: PlanRun[]; skipped: PlanSkipped[]; skipped_blacklist: number; retry: boolean }
  | { type: "source"; key: string; id?: number; status: "running" }
  | ({ type: "source"; status: "done" | "error" } & RunSourceDetail)
  | { type: "job"; job: FoundJob }
  | { type: "liveness"; checked: number; closed: number[] }
  | { type: "sweep"; urgent: number; merged: number; expired: number }
  | { type: "done"; run_id: number; added: number; errors: number; duplicates: number; dropped: Record<string, number>; closed: number; jobs: { id: number; title: string; company: string }[]; widen: WidenCounts };

/** Filter steps the user can loosen after a scan: accept every contract type, or postings up to 60 days old. */
export type Widen = "type" | "age";
/** Offers each widening would bring back, and the contract types that were refused. */
export interface WidenCounts {
  type: number;
  types: string[];
  age: number;
}

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
  /** Only these planned runs (Retry on failed sources). */
  keys?: string[];
  /** Aborted when the client cancels: sources not started yet are skipped, the run is still recorded. */
  signal?: AbortSignal;
}

interface LastDrops {
  runId: number;
  /** Offers the filter refused, by URL, with the first reason. */
  drops: Map<string, { job: NewJob; reason: string }>;
  rank: RankContext;
  applied: Set<string>;
  filterFor: (w: Widen) => (j: NewJob) => { keep: boolean };
}

declare global {
  var __khedmaScanBusy: boolean | undefined;
  var __khedmaStuckRunsClosed: boolean | undefined;
  // ponytail: the last scan's refused offers live in memory only (a few MB); a server restart forgets them and the
  // widen buttons then ask for a new scan. Persist them if widening after a restart matters.
  var __khedmaLastDrops: LastDrops | undefined;
}

export const scanBusy = () => !!globalThis.__khedmaScanBusy;

const LIVENESS_TOP = 20;
const WIDEN_HOURS = 60 * 24;

/** Rank, store and describe one kept offer; null when the database already had it. */
function insertFound(j: NewJob, tier: Tier, ctx: { rank: RankContext; known: KnownIndex; applied: Set<string> }): FoundJob | null {
  const ranked = scoreJob(j, ctx.rank);
  ranked.score = Math.min(100, ranked.score + (tier === 1 ? 6 : tier === 2 ? 3 : 0));
  if (tier === 1) ranked.why.push("tier:1");
  const trust = trustScore(j);
  const { id, inserted } = upsertJob(j);
  ctx.known.add(j);
  ctx.known.seen.add(dedupeKey(j.company, j.title));
  if (!inserted) return null;
  setRelevance(id, ranked.score, ranked.why);
  setTrust(id, trust.score, trust.flags);
  return {
    id, title: j.title, company: j.company, location: j.location, remote: j.remote, type: j.type, url: j.url, source: j.source, deadline: j.deadline,
    relevance: ranked.score, why: ranked.why, trust: trust.score, trustFlags: trust.flags, host: trust.host, queryTier: tier,
    appliedHere: ctx.applied.has(companyKey(j.company)),
  };
}

/** Refused offers of the last scan that a widening `w` would keep. */
function* widened(last: LastDrops, known: KnownIndex, w: Widen) {
  const decide = last.filterFor(w);
  for (const [url, d] of last.drops) if (dropBucket([d.reason]) === w && !known.has(d.job) && decide(d.job).keep) yield { url, ...d };
}

function widenCounts(last: LastDrops, known: KnownIndex): WidenCounts {
  const byType = [...widened(last, known, "type")];  return { type: byType.length, types: [...new Set(byType.map((d) => d.reason.split(":")[1]).filter(Boolean))], age: [...widened(last, known, "age")].length };
}

/** Re-runs only the filter step of the last scan, loosened one way; stores and returns the offers it now keeps. */
export function widenLastScan(w: Widen): FoundJob[] | null {
  const last = globalThis.__khedmaLastDrops;
  if (!last || scanBusy()) return null;
  const known = knownIndex();
  const ctx = { rank: { ...last.rank, seen: known.seen }, known, applied: last.applied };
  const out: FoundJob[] = [];
  for (const d of [...widened(last, known, w)]) {
    last.drops.delete(d.url);
    const fj = insertFound(d.job, 3, ctx);
    if (fj) out.push(fj);
  }
  if (out.length) {
    const run = db().prepare("SELECT new_job_ids FROM scan_runs WHERE id = ?").get(last.runId) as Row | undefined;
    const ids = [...parse<number[]>(run?.new_job_ids, []), ...out.map((j) => j.id)];
    db().prepare("UPDATE scan_runs SET added = added + ?, new_job_ids = ? WHERE id = ?").run(out.length, JSON.stringify(ids), last.runId);
  }
  return out;
}
const TIER_MIN: Record<Tier, number> = { 1: 10, 2: 3, 3: 0 };

/** Query a keyword board tier by tier until it answers with enough listings; other boards run once. */
async function scanTiered(run: PlanRun, profile: Profile, tiers: Tiers, opts: Omit<ScanOptions, "keywords">): Promise<ScanResult & { tierOf: Map<string, Tier> }> {
  const usesKeywords = CATALOG.find((c) => c.kind === run.kind)?.keywords ?? false;
  const tierOf = new Map<string, Tier>();
  let listed: ScanResult["listed"];
  let out: ScanResult = { jobs: [], total: 0, matched: 0, known: 0, dropped: {} };
  const order: Tier[] = usesKeywords ? [1, 2, 3] : [1];
  for (const t of order) {
    const keywords = t === 1 ? run.keywords : tiers[t];
    if (t > 1 && (out.total >= TIER_MIN[(t - 1) as Tier] || !keywords.length)) break;
    const r = await scanSource(run, profile, { ...opts, keywords });
    if (r.listed) listed = r.listed;
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
  return { ...out, tierOf, listed };
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
    const countries = opts.countries?.length ? opts.countries : searchCountries(extra.places.countries, all);
    const places = { countries, cities: countries.includes("TN") ? extra.places.cities : [], remote: opts.remote ?? extra.places.remote };
    const missingEnv = missingKeyKinds();
    const plan = opts.ids?.length
      ? planSources(all.filter((s) => opts.ids!.includes(s.id)), keywords, defaultKeywords(profile, cvText))
      : planSearch({ keywords, countries: places.countries, cities: places.cities, remote: places.remote, enabledSources: all, missingEnv, defaultKeywords: defaultKeywords(profile, cvText) });
    // Blacklisted employers never run as tracked companies.
    const blocked = prefs.companyBlacklist.map((k) => compileKeyword(k));
    const wanted = opts.keys?.length ? plan.runs.filter((r) => opts.keys!.includes(r.key)) : plan.runs;
    const runs = wanted.filter((r) => !(r.company && blocked.some((m) => m(fold(r.label)))));
    const skippedBlacklist = wanted.length - runs.length;

    const started = new Date().toISOString();
    const runId = Number(db().prepare("INSERT INTO scan_runs (started_at, trigger, sources) VALUES (?,?,?)").run(started, opts.trigger ?? "manual", runs.length).lastInsertRowid);
    // retry: a page that reattaches mid-run adds it to the scan it retries instead of replacing that scan.
    emit({ type: "plan", run_id: runId, runs, skipped: plan.skipped, skipped_blacklist: skippedBlacklist, retry: !!opts.keys?.length });

    // Typed keywords are the whole intent: saved target roles only fill in when the user typed none,
    // otherwise an old "développeur" target keeps engineering postings through a "ui/ux designer" search.
    const roles = keywords.length ? [] : profile.target_roles;
    const filterOpts: FilterOptions = { keywords, profile: { ...profile, target_roles: roles }, places, types: opts.types, extraNegatives: opts.negatives, includeSenior: opts.includeSenior, prefs };
    const filter = buildFilter(filterOpts);
    // Refused offers are kept for the widen buttons; a retry adds to the scan it retries.
    const drops: LastDrops["drops"] = opts.keys?.length && globalThis.__khedmaLastDrops ? globalThis.__khedmaLastDrops.drops : new Map();
    const decide = (j: NewJob) => {
      const d = filter.decide(j);
      if (d.keep) drops.delete(j.url);
      else drops.set(j.url, { job: j, reason: d.reasons[0] ?? "other" });
      return d;
    };
    const tiers = buildTiers(keywords, roles);
    const known = knownIndex();
    const tracked = new Set(all.filter((s) => s.company && s.enabled).map((s) => companyKey(s.label)));
    const applied = prefs.applyOnceAtCompany ? appliedCompanies() : new Set<string>();
    const rank: RankContext = { positives: filter.positives, keywords, types: filter.types, places, tracked, seen: known.seen, skills };
    const newIds: number[] = [];
    const found: FoundJob[] = [];
    const dropped: Record<string, number> = {};
    let duplicates = 0;
    const gone: number[] = [];

    const detail = await mapLimit(runs, 3, async (run): Promise<RunSourceDetail> => {
      if (opts.signal?.aborted) return { id: run.sourceId ?? 0, key: run.key, label: run.label, listed: 0, matched: 0, kept: 0, added: 0, known: 0, dropped: {}, ms: 0 };
      emit({ type: "source", key: run.key, id: run.sourceId, status: "running" });
      const t0 = Date.now();
      let res: Awaited<ReturnType<typeof scanTiered>>;
      try {
        // Every fetch and pause this source makes honours Stop, whichever provider makes it.
        res = await scanSignal.run(opts.signal, () => scanTiered(run, profile, tiers, { keepAll: run.keepAll && !opts.keywords?.length, isKnown: known.has, places, decide }));
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
        const fj = insertFound(j, res.tierOf.get(j.url) ?? 1, { rank, known, applied });
        if (!fj) {
          duplicates++;
          continue;
        }
        added++;
        newIds.push(fj.id);
        found.push(fj);
        emit({ type: "job", job: fj });
      }
      duplicates += res.known;
      for (const [k, n] of Object.entries(res.dropped)) dropped[k] = (dropped[k] ?? 0) + n;
      // A complete board listing closes the offers it no longer has.
      if (res.listed) gone.push(...syncBoard(run.kind, res.listed));
      // URLs shrink to their host: keyed APIs carry the key in the path or query string.
      const clean = res.error?.replace(/https?:\/\/([^/\s?#]+)\S*/g, "$1").slice(0, 300);
      const error = clean && !res.jobs.length && !res.total ? clean : undefined;
      // Some offers came back but part of the source failed (one keyword rate-limited): done, with a warning.
      const warning = !error ? clean : undefined;
      if (run.sourceId) db().prepare("UPDATE sources SET last_scan=?, last_count=?, last_total=?, last_error=? WHERE id=?").run(new Date().toISOString(), added, res.total, error ?? null, run.sourceId);
      const d: RunSourceDetail = { id: run.sourceId ?? 0, key: run.key, label: run.label, listed: res.total, matched: res.matched, kept: res.jobs.length, added, known: res.known, dropped: res.dropped, error, warning, ms: Date.now() - t0 };
      emit({ type: "source", status: error ? "error" : "done", ...d });
      return d;
    });

    // Liveness: the best new offers are opened once; closed ones are archived with the check as the note.
    let closed: number[] = [...gone];
    const top = opts.signal?.aborted ? [] : [...found].sort((a, b) => b.relevance - a.relevance).slice(0, LIVENESS_TOP);
    if (top.length) {
      try {
        const checks = await checkJobs(top.map((j) => j.id));
        closed = [...gone, ...checks.filter((c) => c.status === "closed").map((c) => c.job_id)];
        autoArchive(closed);
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
    const loosen = (w: Widen): FilterOptions =>
      w === "type" ? { ...filterOpts, types: [...JOB_TYPES] } : { ...filterOpts, prefs: { ...prefs, hoursOld: (prefs.hoursOld && Math.max(prefs.hoursOld, WIDEN_HOURS)) as SearchPrefs["hoursOld"] } };
    const last: LastDrops = { runId, drops, rank, applied, filterFor: (w) => buildFilter(loosen(w)).decide };
    globalThis.__khedmaLastDrops = last;
    emit({ type: "done", run_id: runId, added: sum("added"), errors, duplicates, dropped, closed: closed.length, jobs: best, widen: widenCounts(last, known) });
    return listRuns(1)[0];
  } finally {
    globalThis.__khedmaScanBusy = false;
  }
}

/**
 * Re-scores every open offer against the current CV and profile (after a new CV): same ranking as a scan,
 * without the per-search tier bonus. Returns how many offers were re-scored.
 */
export function rerankOpenJobs(): number {
  ensure();
  const profile = getProfile();
  const extra = getProfileExtra();
  const all = listSourceRows();
  const cvText = cvForMatching().text;
  const keywords = defaultKeywords(profile, cvText);
  const countries = searchCountries(extra.places.countries, all);
  const places = { countries, cities: countries.includes("TN") ? extra.places.cities : [], remote: extra.places.remote };
  const filter = buildFilter({ keywords, profile, places, prefs: getSearchPrefs() });
  const rank: RankContext = {
    positives: filter.positives, keywords, types: filter.types, places, seen: new Set<string>(), skills: cvSkills(profile, cvText),
    tracked: new Set(all.filter((s) => s.company && s.enabled).map((s) => companyKey(s.label))),
  };
  const jobs = listJobs();
  for (const j of jobs) {
    const r = scoreJob(j, rank);
    setRelevance(j.id, r.score, r.why);
  }
  return jobs.length;
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
