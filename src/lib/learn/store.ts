// Course catalog in the local database: one refresh per source and week, then searched offline. Server only.
import { db, kvGet, kvSet, migrate } from "../db";
import { COURSE_SOURCES } from "./sources";
import { courseHaystack, searchWords, wordPattern, type CertKind, type Course, type FieldKey, type NewCourse, type PriceKind } from "./model";

type Row = Record<string, unknown>;
const WEEK = 7 * 86_400_000;

export function ensureLearnSchema(): void {
  migrate(
    "learn:001-courses",
    `CREATE TABLE IF NOT EXISTS courses (
       id INTEGER PRIMARY KEY,
       source TEXT NOT NULL,
       url TEXT NOT NULL,
       title TEXT NOT NULL,
       provider TEXT NOT NULL DEFAULT '',
       description TEXT NOT NULL DEFAULT '',
       fields TEXT NOT NULL DEFAULT '[]',
       skills TEXT NOT NULL DEFAULT '[]',
       level TEXT,
       duration_min INTEGER,
       languages TEXT NOT NULL DEFAULT '[]',
       price TEXT NOT NULL,
       cert TEXT NOT NULL,
       image TEXT,
       updated_at TEXT,
       expires_at TEXT,
       haystack TEXT NOT NULL DEFAULT '',
       UNIQUE(source, url)
     );
     CREATE INDEX IF NOT EXISTS courses_source ON courses(source);`,
  );
  // Coursera's API is not read (its robots.txt disallows /api/): drop rows a development build may have stored.
  migrate("learn:002-no-coursera-api", "DELETE FROM courses WHERE source = 'coursera';");
  // Haystacks end with a space so short words can match whole words.
  migrate("learn:003-haystack-end", "UPDATE courses SET haystack = haystack || ' ' WHERE haystack NOT LIKE '% ';");
}

const json = <T,>(v: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(v ?? "")) as T;
  } catch {
    return fallback;
  }
};
const toCourse = (r: Row): Course => ({
  id: r.id as number,
  source: r.source as string,
  title: r.title as string,
  url: r.url as string,
  provider: r.provider as string,
  description: r.description as string,
  fields: json(r.fields, []),
  skills: json(r.skills, []),
  level: (r.level as Course["level"]) ?? null,
  duration_min: (r.duration_min as number) ?? null,
  languages: json(r.languages, []),
  price: r.price as PriceKind,
  cert: r.cert as CertKind,
  image: (r.image as string) ?? null,
  updated_at: (r.updated_at as string) ?? null,
  expires_at: (r.expires_at as string) ?? null,
});

/** Replace one source's catalog in a single transaction (a failed fetch never empties it: callers pass only results). */
export function replaceCourses(source: string, list: NewCourse[]): number {
  ensureLearnSchema();
  const d = db();
  const ins = d.prepare(
    `INSERT OR IGNORE INTO courses (source, url, title, provider, description, fields, skills, level, duration_min, languages, price, cert, image, updated_at, expires_at, haystack)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  d.exec("BEGIN");
  try {
    d.prepare("DELETE FROM courses WHERE source = ?").run(source);
    for (const c of list)
      ins.run(c.source, c.url, c.title, c.provider, c.description, JSON.stringify(c.fields), JSON.stringify(c.skills), c.level, c.duration_min, JSON.stringify(c.languages), c.price, c.cert, c.image, c.updated_at, c.expires_at, courseHaystack(c));
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return list.length;
}

export interface RefreshState {
  /** When each source was last read successfully, how many courses it gave, and the last failed attempt. */
  sources: Record<string, { at: string; n: number; error?: string; tried?: string }>;
  running: boolean;
}
const STATE_KEY = "learn:refresh";
declare global {
  var __khedmaLearnRefresh: Promise<void> | undefined;
}

export function refreshState(): RefreshState {
  const all = kvGet<RefreshState["sources"]>(STATE_KEY, {});
  // Only the sources read today (a source dropped later, like Coursera's API, leaves no stale line).
  const sources = Object.fromEntries(Object.entries(all).filter(([k]) => k in COURSE_SOURCES));
  return { sources, running: !!globalThis.__khedmaLearnRefresh };
}

// Coupons expire within days: their feed is read twice a day; catalogs weekly.
const MAX_AGE: Record<string, number> = { coupons: 12 * 3_600_000 };

// A source that failed is tried again after 6 hours, not on every visit.
const RETRY = 6 * 3_600_000;

/** Sources due for a refresh (or never read). */
export function staleSources(now = Date.now()): string[] {
  const s = refreshState().sources;
  return Object.keys(COURSE_SOURCES).filter((k) => {
    const x = s[k];
    if (!x) return true;
    const due = now - Date.parse(x.at) > (MAX_AGE[k] ?? WEEK);
    return due && (!x.tried || now - Date.parse(x.tried) > RETRY);
  });
}

/**
 * Read the given sources (default: the stale ones) one after another; one refresh at a time. A source that fails
 * keeps its previous catalog and records the error.
 */
export function refreshCatalog(only?: string[]): Promise<void> {
  if (globalThis.__khedmaLearnRefresh) return globalThis.__khedmaLearnRefresh;
  const list = (only ?? staleSources()).filter((k) => k in COURSE_SOURCES);
  globalThis.__khedmaLearnRefresh = (async () => {
    for (const key of list) {
      const { courses, error } = await COURSE_SOURCES[key]().catch((e: Error) => ({ courses: [], error: e.message }));
      const state = kvGet<RefreshState["sources"]>(STATE_KEY, {});
      if (courses.length) state[key] = { at: new Date().toISOString(), n: replaceCourses(key, courses), ...(error ? { error: error.slice(0, 200) } : {}) };
      else state[key] = { ...(state[key] ?? { at: new Date(0).toISOString(), n: 0 }), error: (error ?? "empty answer").slice(0, 200), tried: new Date().toISOString() };
      kvSet(STATE_KEY, state);
    }
  })().finally(() => {
    globalThis.__khedmaLearnRefresh = undefined;
  });
  return globalThis.__khedmaLearnRefresh;
}

export interface CourseQuery {
  q?: string;
  field?: FieldKey | null;
  price?: "free" | "cert" | "paid" | null;
  lang?: string | null;
  source?: string | null;
  maxHours?: number | null;
  limit?: number;
  offset?: number;
}

/** Search the catalog. Every word of `q` must appear; courses whose enrolment closed are left out. */
export function searchCourses(f: CourseQuery): { courses: Course[]; total: number } {
  ensureLearnSchema();
  const where: string[] = ["(expires_at IS NULL OR expires_at >= ?)"];
  const args: (string | number)[] = [new Date().toISOString().slice(0, 10)];
  const cond = (sql: string, ...a: (string | number)[]) => {
    where.push(sql);
    args.push(...a);
  };
  for (const w of searchWords(f.q ?? "").slice(0, 6)) cond("haystack LIKE ?", wordPattern(w));
  if (f.field) cond("fields LIKE ?", `%"${f.field}"%`);
  if (f.price === "free") cond("price IN ('free','freemium','coupon')");
  if (f.price === "paid") cond("price = 'paid'");
  if (f.price === "cert") cond("cert IN ('paid','proctored','credit','completion')");
  if (f.lang) cond("languages LIKE ?", `%"${f.lang}"%`);
  if (f.source) cond("source = ?", f.source);
  if (f.maxHours) cond("(duration_min IS NULL OR duration_min <= ?)", f.maxHours * 60);
  const sql = where.join(" AND ");
  const total = (db().prepare(`SELECT COUNT(*) AS n FROM courses WHERE ${sql}`).get(...args) as { n: number }).n;
  // Title hits first, then free before paid, then shorter first.
  const titleFirst = f.q?.trim() ? `CASE WHEN haystack LIKE ? THEN 0 ELSE 1 END,` : "";
  const order = `${titleFirst} CASE price WHEN 'free' THEN 0 WHEN 'coupon' THEN 1 WHEN 'freemium' THEN 2 ELSE 3 END, COALESCE(duration_min, 600)`;
  const rows = db()
    .prepare(`SELECT * FROM courses WHERE ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...args, ...(titleFirst ? [` ${searchWords(f.q!).join(" ")}%`] : []), Math.min(f.limit ?? 30, 100), f.offset ?? 0) as Row[];
  return { courses: rows.map(toCourse), total };
}

/** Courses per field and per source, for the page's chips. */
export function catalogCounts(): { fields: Record<string, number>; sources: Record<string, number>; total: number } {
  ensureLearnSchema();
  const fields: Record<string, number> = {};
  const sources: Record<string, number> = {};
  let total = 0;
  for (const r of db().prepare("SELECT source, fields FROM courses").all() as Row[]) {
    total++;
    sources[r.source as string] = (sources[r.source as string] ?? 0) + 1;
    for (const f of json<string[]>(r.fields, [])) fields[f] = (fields[f] ?? 0) + 1;
  }
  return { fields, sources, total };
}

/**
 * Candidates for recommendations: for each skill or word, the courses naming it in their title first, then in their
 * text, a few from every source (a plain LIMIT returned whichever catalog was stored first).
 */
export function coursesMatching(words: string[], perWord = 60): Course[] {
  ensureLearnSchema();
  const ws = [...new Set(words.map((w) => searchWords(w).join(" ")).filter(Boolean))].slice(0, 24);
  const today = new Date().toISOString().slice(0, 10);
  const st = db().prepare(
    `SELECT * FROM (
       SELECT *, ROW_NUMBER() OVER (PARTITION BY source ORDER BY CASE WHEN haystack LIKE ? THEN 0 ELSE 1 END, id) AS r
       FROM courses WHERE (expires_at IS NULL OR expires_at >= ?) AND haystack LIKE ?
     ) WHERE r <= 6 ORDER BY r LIMIT ?`,
  );
  const byId = new Map<number, Course>();
  for (const w of ws) {
    for (const r of st.all(` ${w}%`, today, wordPattern(w), perWord) as Row[]) if (!byId.has(r.id as number)) byId.set(r.id as number, toCourse(r));
  }
  return [...byId.values()];
}
