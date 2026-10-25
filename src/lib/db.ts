import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  type AppEvent,
  type Application,
  type AppState,
  type Evaluation,
  type InterviewPrep,
  type Job,
  type Profile,
  type Settings,
  type Source,
} from "./types";
import { stripHidden } from "./ai/text";
import { fold } from "./sources/classify";

const DATA_DIR = process.env.KHEDMA_DATA ?? path.join(process.cwd(), "data");
const DB_PATH = process.env.KHEDMA_DB ?? path.join(DATA_DIR, "khedma.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  cv_md TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]',
  target_roles TEXT NOT NULL DEFAULT '[]',
  target_locations TEXT NOT NULL DEFAULT '[]',
  target_types TEXT NOT NULL DEFAULT '["stage","pfe"]',
  languages TEXT NOT NULL DEFAULT '["fr","en"]',
  settings TEXT NOT NULL DEFAULT '{}'
);
INSERT OR IGNORE INTO profile (id) VALUES (1);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  remote INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'manual',
  type TEXT NOT NULL DEFAULT 'stage',
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  posted_at TEXT,
  deadline TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  global REAL NOT NULL,
  match REAL NOT NULL,
  target REAL NOT NULL,
  growth REAL NOT NULL,
  culture REAL NOT NULL,
  red_flags REAL NOT NULL,
  strengths TEXT NOT NULL DEFAULT '[]',
  gaps TEXT NOT NULL DEFAULT '[]',
  flags TEXT NOT NULL DEFAULT '[]',
  verdict TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  engine TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS evaluations_job ON evaluations(job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'evaluated',
  notes TEXT NOT NULL DEFAULT '',
  cv_md TEXT,
  cover_letter_md TEXT,
  interview_prep TEXT,
  applied_at TEXT,
  next_action_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS events_app ON events(application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  handle TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_scan TEXT,
  last_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(kind, handle)
);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

declare global {
  var __khedmaDb: DatabaseSync | undefined;
}

export function db(): DatabaseSync {
  if (globalThis.__khedmaDb) return globalThis.__khedmaDb;
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const d = new DatabaseSync(DB_PATH);
  d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  // Accent- and case-insensitive search: SQL `fold(col) LIKE fold(query)`.
  d.function("fold", { deterministic: true }, (s) => fold(String(s ?? "")));
  d.exec(SCHEMA);
  globalThis.__khedmaDb = d;
  runCoreMigrations(d);
  return d;
}

/**
 * Run a schema change exactly once, keyed by a unique id ("offers:001-starred").
 * Feature modules call this lazily before their first query; it is cheap after the first run.
 */
export function migrate(id: string, sql: string): void {
  const d = db();
  d.exec("CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  if (d.prepare("SELECT 1 FROM _migrations WHERE id = ?").get(id)) return;
  d.exec("BEGIN");
  try {
    d.exec(sql);
    d.prepare("INSERT INTO _migrations (id) VALUES (?)").run(id);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

/** Stored settings over the defaults. Any engine choice other than "offline" (older ones included) means "auto". */
function normalizeSettings(s: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...s, provider: s.provider === "offline" ? "offline" : "auto" };
}

/** Shared tables several areas read (pipeline writes them, calendar/dashboard read them). */
function runCoreMigrations(d: DatabaseSync) {
  void d;
  migrate(
    "core:001-shared",
    `ALTER TABLE jobs ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
     CREATE TABLE IF NOT EXISTS contacts (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       role TEXT NOT NULL DEFAULT '',
       email TEXT NOT NULL DEFAULT '',
       phone TEXT NOT NULL DEFAULT '',
       linkedin TEXT NOT NULL DEFAULT '',
       notes TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     );
     CREATE TABLE IF NOT EXISTS interviews (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
       starts_at TEXT NOT NULL,
       duration_min INTEGER NOT NULL DEFAULT 45,
       kind TEXT NOT NULL DEFAULT 'technical',
       location TEXT NOT NULL DEFAULT '',
       notes TEXT NOT NULL DEFAULT '',
       outcome TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     );
     CREATE INDEX IF NOT EXISTS interviews_start ON interviews(starts_at);
     CREATE TABLE IF NOT EXISTS reminders (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
       job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
       title TEXT NOT NULL,
       due_at TEXT NOT NULL,
       done INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     );
     CREATE INDEX IF NOT EXISTS reminders_due ON reminders(done, due_at);`,
  );
  // People are a network, not one application's attachment: application optional (deleting it keeps the
  // person), company kept on the person.
  migrate(
    "core:002-contacts-network",
    `CREATE TABLE contacts_new (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
       name TEXT NOT NULL,
       role TEXT NOT NULL DEFAULT '',
       company TEXT NOT NULL DEFAULT '',
       email TEXT NOT NULL DEFAULT '',
       phone TEXT NOT NULL DEFAULT '',
       linkedin TEXT NOT NULL DEFAULT '',
       notes TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     );
     INSERT INTO contacts_new (id, application_id, name, role, company, email, phone, linkedin, notes, created_at)
       SELECT c.id, c.application_id, c.name, c.role, COALESCE(j.company, ''), c.email, c.phone, c.linkedin, c.notes, c.created_at
       FROM contacts c LEFT JOIN applications a ON a.id = c.application_id LEFT JOIN jobs j ON j.id = a.job_id;
     DROP TABLE contacts;
     ALTER TABLE contacts_new RENAME TO contacts;
     CREATE INDEX IF NOT EXISTS contacts_app ON contacts(application_id);`,
  );
}

// ---------- helpers ----------
type Row = Record<string, unknown>;
const j = <T>(s: unknown, fallback: T): T => {
  try {
    return s ? (JSON.parse(String(s)) as T) : fallback;
  } catch {
    return fallback;
  }
};

const rowToJob = (r: Row): Job => ({
  id: r.id as number,
  title: r.title as string,
  company: r.company as string,
  location: r.location as string,
  remote: !!r.remote,
  url: r.url as string,
  source: r.source as Job["source"],
  type: r.type as Job["type"],
  description: r.description as string,
  tags: j<string[]>(r.tags, []),
  posted_at: (r.posted_at as string) ?? null,
  deadline: (r.deadline as string) ?? null,
  created_at: r.created_at as string,
  archived: !!r.archived,
  starred: !!r.starred,
});

const rowToEval = (r: Row): Evaluation => ({
  id: r.id as number,
  job_id: r.job_id as number,
  global: r.global as number,
  match: r.match as number,
  target: r.target as number,
  growth: r.growth as number,
  culture: r.culture as number,
  red_flags: r.red_flags as number,
  strengths: j<string[]>(r.strengths, []),
  gaps: j<string[]>(r.gaps, []),
  flags: j<string[]>(r.flags, []),
  verdict: r.verdict as Evaluation["verdict"],
  summary: r.summary as string,
  engine: r.engine as string,
  created_at: r.created_at as string,
});

const rowToApp = (r: Row): Application => ({
  id: r.id as number,
  job_id: r.job_id as number,
  status: r.status as AppState,
  notes: r.notes as string,
  cv_md: (r.cv_md as string) ?? null,
  cover_letter_md: (r.cover_letter_md as string) ?? null,
  interview_prep: j<InterviewPrep | null>(r.interview_prep, null),
  applied_at: (r.applied_at as string) ?? null,
  next_action_at: (r.next_action_at as string) ?? null,
  created_at: r.created_at as string,
  updated_at: r.updated_at as string,
});

// ---------- profile ----------
export function getProfile(): Profile {
  const r = db().prepare("SELECT * FROM profile WHERE id = 1").get() as Row;
  return {
    id: 1,
    name: r.name as string,
    email: r.email as string,
    headline: r.headline as string,
    cv_md: r.cv_md as string,
    skills: j<string[]>(r.skills, []),
    target_roles: j<string[]>(r.target_roles, []),
    target_locations: j<string[]>(r.target_locations, []),
    target_types: j<Profile["target_types"]>(r.target_types, ["stage", "pfe"]),
    languages: j<string[]>(r.languages, ["fr", "en"]),
    settings: normalizeSettings(j<Partial<Settings>>(r.settings, {})),
  };
}

export function updateProfile(p: Partial<Omit<Profile, "id">>): void {
  const cur = getProfile();
  const next = { ...cur, ...p, settings: { ...cur.settings, ...(p.settings ?? {}) } };
  db()
    .prepare(
      `UPDATE profile SET name=?, email=?, headline=?, cv_md=?, skills=?, target_roles=?,
       target_locations=?, target_types=?, languages=?, settings=? WHERE id = 1`,
    )
    .run(
      next.name,
      next.email,
      next.headline,
      next.cv_md,
      JSON.stringify(next.skills),
      JSON.stringify(next.target_roles),
      JSON.stringify(next.target_locations),
      JSON.stringify(next.target_types),
      JSON.stringify(next.languages),
      JSON.stringify(next.settings),
    );
}

// ---------- jobs ----------
export type NewJob = Omit<Job, "id" | "created_at" | "archived" | "starred"> & { archived?: boolean; starred?: boolean };

/** Insert or ignore (by url). Returns the job id and whether it was new. */
export function upsertJob(job: NewJob): { id: number; inserted: boolean } {
  const d = db();
  const existing = d.prepare("SELECT id FROM jobs WHERE url = ?").get(job.url) as Row | undefined;
  if (existing) return { id: existing.id as number, inserted: false };
  const res = d
    .prepare(
      `INSERT INTO jobs (title, company, location, remote, url, source, type, description, tags, posted_at, deadline)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      stripHidden(job.title),
      job.company,
      job.location,
      job.remote ? 1 : 0,
      job.url,
      job.source,
      job.type,
      stripHidden(job.description),
      JSON.stringify(job.tags),
      job.posted_at,
      job.deadline,
    );
  return { id: Number(res.lastInsertRowid), inserted: true };
}

/** SQL guard for archiving the app does on its own (closed, merged, expired): never an offer the user starred or applied to. */
export const KEPT_BY_USER = "starred = 1 OR id IN (SELECT job_id FROM applications)";

/** Archive offers found closed, unless the user starred one or applied to it. Returns the ids actually archived. */
export function autoArchive(ids: number[]): number[] {
  const st = db().prepare(`UPDATE jobs SET archived = 1 WHERE id = ? AND archived = 0 AND NOT (${KEPT_BY_USER})`);
  return ids.filter((id) => Number(st.run(id).changes) > 0);
}

export function updateJob(id: number, patch: Partial<NewJob>): void {
  const cur = getJob(id);
  if (!cur) return;
  const n = { ...cur, ...patch };
  db()
    .prepare(
      `UPDATE jobs SET title=?, company=?, location=?, remote=?, url=?, type=?, description=?, tags=?, posted_at=?, deadline=?, archived=?, starred=? WHERE id=?`,
    )
    .run(
      n.title,
      n.company,
      n.location,
      n.remote ? 1 : 0,
      n.url,
      n.type,
      n.description,
      JSON.stringify(n.tags),
      n.posted_at,
      n.deadline,
      n.archived ? 1 : 0,
      n.starred ? 1 : 0,
      id,
    );
}

export function deleteJob(id: number): void {
  db().prepare("DELETE FROM jobs WHERE id = ?").run(id);
}

export function getJob(id: number): Job | null {
  const r = db().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToJob(r) : null;
}

export interface JobWithMeta extends Job {
  evaluation: Evaluation | null;
  application: Application | null;
}

export function listJobs(opts: { q?: string; type?: string; archived?: boolean } = {}): JobWithMeta[] {
  const where: string[] = ["archived = ?"];
  const args: (string | number)[] = [opts.archived ? 1 : 0];
  if (opts.q) {
    where.push("(fold(title) LIKE ? OR fold(company) LIKE ? OR fold(location) LIKE ? OR fold(tags) LIKE ?)");
    const like = `%${fold(opts.q)}%`;
    args.push(like, like, like, like);
  }
  if (opts.type) {
    where.push("type = ?");
    args.push(opts.type);
  }
  const rows = db()
    .prepare(`SELECT * FROM jobs WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC`)
    .all(...args) as Row[];
  return attachMeta(rows.map(rowToJob));
}

export function withMeta(job: Job): JobWithMeta {
  return { ...job, evaluation: latestEvaluation(job.id), application: getApplicationByJob(job.id) };
}

/** Latest evaluation + application for many jobs in two queries instead of 2N. */
export function attachMeta(jobs: Job[]): JobWithMeta[] {
  if (jobs.length === 0) return [];
  const d = db();
  const ids = jobs.map((j) => j.id);
  const marks = ids.map(() => "?").join(",");
  const evals = new Map<number, Evaluation>();
  for (const r of d
    .prepare(
      `SELECT e.* FROM evaluations e
       JOIN (SELECT job_id, MAX(id) AS id FROM evaluations WHERE job_id IN (${marks}) GROUP BY job_id) m ON m.id = e.id`,
    )
    .all(...ids) as Row[]) {
    const e = rowToEval(r);
    evals.set(e.job_id, e);
  }
  const apps = new Map<number, Application>();
  for (const r of d.prepare(`SELECT * FROM applications WHERE job_id IN (${marks})`).all(...ids) as Row[]) {
    const a = rowToApp(r);
    apps.set(a.job_id, a);
  }
  return jobs.map((j) => ({ ...j, evaluation: evals.get(j.id) ?? null, application: apps.get(j.id) ?? null }));
}

// ---------- evaluations ----------
export function latestEvaluation(jobId: number): Evaluation | null {
  const r = db()
    .prepare("SELECT * FROM evaluations WHERE job_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
    .get(jobId) as Row | undefined;
  return r ? rowToEval(r) : null;
}

export function insertEvaluation(e: Omit<Evaluation, "id" | "created_at">): Evaluation {
  const res = db()
    .prepare(
      `INSERT INTO evaluations (job_id, global, match, target, growth, culture, red_flags, strengths, gaps, flags, verdict, summary, engine)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      e.job_id,
      e.global,
      e.match,
      e.target,
      e.growth,
      e.culture,
      e.red_flags,
      JSON.stringify(e.strengths),
      JSON.stringify(e.gaps),
      JSON.stringify(e.flags),
      e.verdict,
      e.summary,
      e.engine,
    );
  const row = db().prepare("SELECT * FROM evaluations WHERE id = ?").get(Number(res.lastInsertRowid)) as Row;
  return rowToEval(row);
}

// ---------- applications ----------
export function getApplicationByJob(jobId: number): Application | null {
  const r = db().prepare("SELECT * FROM applications WHERE job_id = ?").get(jobId) as Row | undefined;
  return r ? rowToApp(r) : null;
}

export function getApplication(id: number): Application | null {
  const r = db().prepare("SELECT * FROM applications WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToApp(r) : null;
}

export function ensureApplication(jobId: number): Application {
  const existing = getApplicationByJob(jobId);
  if (existing) return existing;
  const res = db().prepare("INSERT INTO applications (job_id) VALUES (?)").run(jobId);
  const app = getApplication(Number(res.lastInsertRowid))!;
  addEvent(app.id, "status", "evaluated");
  return app;
}

export function updateApplication(
  id: number,
  patch: Partial<Pick<Application, "status" | "notes" | "cv_md" | "cover_letter_md" | "interview_prep" | "applied_at" | "next_action_at">>,
): void {
  const cur = getApplication(id);
  if (!cur) return;
  const n = { ...cur, ...patch };
  if (patch.status && patch.status !== cur.status) {
    addEvent(id, "status", patch.status);
    if (patch.status === "applied" && !n.applied_at) n.applied_at = new Date().toISOString();
  }
  db()
    .prepare(
      `UPDATE applications SET status=?, notes=?, cv_md=?, cover_letter_md=?, interview_prep=?, applied_at=?, next_action_at=?, updated_at=datetime('now') WHERE id=?`,
    )
    .run(
      n.status,
      n.notes,
      n.cv_md,
      n.cover_letter_md,
      n.interview_prep ? JSON.stringify(n.interview_prep) : null,
      n.applied_at,
      n.next_action_at,
      id,
    );
}

export interface ApplicationWithJob extends Application {
  job: Job;
  evaluation: Evaluation | null;
}

export function listApplications(): ApplicationWithJob[] {
  const rows = db()
    .prepare(
      `SELECT a.*, j.id AS j_id FROM applications a JOIN jobs j ON j.id = a.job_id ORDER BY a.updated_at DESC`,
    )
    .all() as Row[];
  const apps = rows.map(rowToApp);
  if (apps.length === 0) return [];
  const ids = apps.map((a) => a.job_id);
  const marks = ids.map(() => "?").join(",");
  const jobs = new Map<number, JobWithMeta>();
  for (const j of attachMeta((db().prepare(`SELECT * FROM jobs WHERE id IN (${marks})`).all(...ids) as Row[]).map(rowToJob))) jobs.set(j.id, j);
  return apps.map((app) => {
    const j = jobs.get(app.job_id)!;
    return { ...app, job: j, evaluation: j.evaluation };
  });
}

export function addEvent(applicationId: number, kind: AppEvent["kind"], payload: string): void {
  db().prepare("INSERT INTO events (application_id, kind, payload) VALUES (?,?,?)").run(applicationId, kind, payload);
}

export function listEvents(applicationId: number): AppEvent[] {
  return db()
    .prepare("SELECT * FROM events WHERE application_id = ? ORDER BY created_at DESC, id DESC")
    .all(applicationId) as unknown as AppEvent[];
}

// ---------- sources ----------
export function listSources(): Source[] {
  const rows = db().prepare("SELECT * FROM sources ORDER BY id").all() as Row[];
  return rows.map((r) => ({
    id: r.id as number,
    kind: r.kind as Source["kind"],
    label: r.label as string,
    handle: r.handle as string,
    enabled: !!r.enabled,
    last_scan: (r.last_scan as string) ?? null,
    last_count: r.last_count as number,
  }));
}

export function addSource(s: Pick<Source, "kind" | "label" | "handle">): void {
  db()
    .prepare("INSERT OR IGNORE INTO sources (kind, label, handle) VALUES (?,?,?)")
    .run(s.kind, s.label, s.handle);
}

export function updateSource(id: number, patch: Partial<Pick<Source, "enabled" | "last_scan" | "last_count">>): void {
  const cur = listSources().find((s) => s.id === id);
  if (!cur) return;
  const n = { ...cur, ...patch };
  db()
    .prepare("UPDATE sources SET enabled=?, last_scan=?, last_count=? WHERE id=?")
    .run(n.enabled ? 1 : 0, n.last_scan, n.last_count, id);
}

export function deleteSource(id: number): void {
  db().prepare("DELETE FROM sources WHERE id = ?").run(id);
}

// ---------- kv ----------
export function kvGet<T>(key: string, fallback: T): T {
  const r = db().prepare("SELECT value FROM kv WHERE key = ?").get(key) as Row | undefined;
  return r ? j<T>(r.value, fallback) : fallback;
}
export function kvSet(key: string, value: unknown): void {
  db().prepare("INSERT INTO kv (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value));
}

// ---------- stats ----------
export function stats() {
  const d = db();
  const count = (sql: string) => (d.prepare(sql).get() as Row).n as number;
  const byStatus = d.prepare("SELECT status, COUNT(*) AS n FROM applications GROUP BY status").all() as Row[];
  return {
    jobs: count("SELECT COUNT(*) AS n FROM jobs WHERE archived = 0"),
    evaluated: count("SELECT COUNT(DISTINCT job_id) AS n FROM evaluations"),
    applications: count("SELECT COUNT(*) AS n FROM applications"),
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status as string, r.n as number])) as Record<AppState, number>,
    avgScore: (d.prepare("SELECT AVG(global) AS n FROM evaluations").get() as Row).n as number | null,
  };
}
