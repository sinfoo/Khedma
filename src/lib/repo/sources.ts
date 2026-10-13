// Sources area data access: per-source scan config, scan runs history, auto-scan setting
// and the scan orchestrator shared by the streaming route and the server actions.
import { db, getProfile, kvGet, kvSet, migrate, upsertJob, type NewJob } from "../db";
import type { Profile } from "../types";
import { dedupeKey, isProviderKind, scanSource, type ProviderKind } from "../sources";
import { mapLimit } from "../sources/http";

type Row = Record<string, unknown>;

function ensure() {
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
}

/** Returns the new id, or null when the same board (kind + handle) is already there. */
export function createSourceRow(s: SourceInput): number | null {
  ensure();
  const res = db()
    .prepare("INSERT OR IGNORE INTO sources (kind, label, handle, keywords, keep_all) VALUES (?,?,?,?,?)")
    .run(s.kind, s.label, s.handle, s.keywords.join(", "), s.keep_all ? 1 : 0);
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

/** Keywords used when a source has none: target roles first, then internship kinds. */
export function defaultKeywords(profile: Profile): string[] {
  const kinds = profile.target_types.filter((t) => t === "stage" || t === "pfe" || t === "alternance");
  // Head word of each role ("Développeur full stack" -> "développeur", "Data analyst" -> "data"):
  // boards phrase-match keywords, and the profile filter narrows the results afterwards.
  const roles = profile.target_roles.map((r) => r.trim().split(/\s+/)[0]).filter((w) => w && w.length >= 3);
  return [...new Set([...roles, ...kinds].map((k) => k.toLowerCase()))].slice(0, 6);
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
  id: number;
  label: string;
  listed: number;
  matched: number;
  added: number;
  known: number;
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
export type ScanEvent =
  | { type: "start"; run_id: number; sources: { id: number; label: string; kind: string }[] }
  | { type: "source"; id: number; status: "running" }
  | ({ type: "source"; status: "done" | "error" } & RunSourceDetail)
  | { type: "done"; run_id: number; added: number; errors: number; duplicates: number; jobs: { id: number; title: string; company: string }[] };

declare global {
  var __khedmaScanBusy: boolean | undefined;
}

export const scanBusy = () => !!globalThis.__khedmaScanBusy;

/** URLs and company+title keys of every stored offer (archived ones too, so they do not come back). */
function knownIndex() {
  const rows = db().prepare("SELECT url, company, title FROM jobs").all() as Row[];
  const urls = new Set(rows.map((r) => r.url as string));
  const keys = new Set(rows.map((r) => dedupeKey(r.company as string, r.title as string)));
  return {
    has: (j: NewJob) => urls.has(j.url) || keys.has(dedupeKey(j.company, j.title)),
    add: (j: NewJob) => {
      urls.add(j.url);
      keys.add(dedupeKey(j.company, j.title));
    },
  };
}

/**
 * Scan the given sources (default: all enabled), 3 boards at a time. Emits progress
 * events and records one scan_runs row. Returns null when another scan is running.
 */
export async function runScan(opts: { ids?: number[]; trigger?: "manual" | "auto"; onEvent?: (e: ScanEvent) => void } = {}): Promise<ScanRun | null> {
  if (globalThis.__khedmaScanBusy) return null;
  globalThis.__khedmaScanBusy = true;
  try {
    ensure();
    const emit = opts.onEvent ?? (() => {});
    const all = listSourceRows();
    const sources = opts.ids?.length ? all.filter((s) => opts.ids!.includes(s.id)) : all.filter((s) => s.enabled);
    const profile = getProfile();
    const started = new Date().toISOString();
    const runId = Number(
      db().prepare("INSERT INTO scan_runs (started_at, trigger, sources) VALUES (?,?,?)").run(started, opts.trigger ?? "manual", sources.length).lastInsertRowid,
    );
    emit({ type: "start", run_id: runId, sources: sources.map((s) => ({ id: s.id, label: s.label, kind: s.kind })) });

    const known = knownIndex();
    const newIds: number[] = [];
    const newJobs: { id: number; title: string; company: string }[] = [];
    let duplicates = 0;

    const detail = await mapLimit(sources, 3, async (s): Promise<RunSourceDetail> => {
      emit({ type: "source", id: s.id, status: "running" });
      const t0 = Date.now();
      let res: Awaited<ReturnType<typeof scanSource>>;
      if (!isProviderKind(s.kind)) res = { jobs: [], total: 0, matched: 0, known: 0, error: `Unknown source kind: ${s.kind}` };
      else {
        try {
          res = await scanSource(s, profile, { keywords: s.keywords.length ? s.keywords : defaultKeywords(profile), keepAll: s.keep_all, isKnown: known.has });
        } catch (e) {
          res = { jobs: [], total: 0, matched: 0, known: 0, error: (e as Error).message };
        }
      }
      let added = 0;
      for (const j of res.jobs) {
        // A board scanned in parallel may have added the same offer a moment ago.
        if (known.has(j)) {
          duplicates++;
          continue;
        }
        const { id, inserted } = upsertJob(j);
        known.add(j);
        if (!inserted) {
          duplicates++;
          continue;
        }
        added++;
        newIds.push(id);
        newJobs.push({ id, title: j.title, company: j.company });
      }
      duplicates += res.known;
      const error = res.error && !res.jobs.length && !res.total ? res.error.slice(0, 300) : undefined;
      db()
        .prepare("UPDATE sources SET last_scan=?, last_count=?, last_total=?, last_error=? WHERE id=?")
        .run(new Date().toISOString(), added, res.total, error ?? null, s.id);
      const d: RunSourceDetail = { id: s.id, label: s.label, listed: res.total, matched: res.matched, added, known: res.known, error, ms: Date.now() - t0 };
      emit({ type: "source", status: error ? "error" : "done", ...d });
      return d;
    });

    const sum = (k: "listed" | "matched" | "added") => detail.reduce((a, d) => a + d[k], 0);
    const errors = detail.filter((d) => d.error).length;
    db()
      .prepare("UPDATE scan_runs SET finished_at=?, listed=?, matched=?, added=?, duplicates=?, errors=?, new_job_ids=?, detail=? WHERE id=?")
      .run(new Date().toISOString(), sum("listed"), sum("matched"), sum("added"), duplicates, errors, JSON.stringify(newIds), JSON.stringify(detail), runId);
    emit({ type: "done", run_id: runId, added: sum("added"), errors, duplicates, jobs: newJobs.slice(0, 8) });
    return listRuns(1)[0];
  } finally {
    globalThis.__khedmaScanBusy = false;
  }
}
