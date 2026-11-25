// Scholarships in the local database: live calls read from feeds, the student's tracking, and the feed scan. Server only.
// A stored call is a title, a date, the feed's tags, the extracted facts and the link to its source. The article text
// of a feed item is never stored: several publishers forbid republishing it.
import { db, kvGet, kvSet, migrate } from "../db";
import { getText, mapLimit } from "../sources/http";
import { parseFeed, toCalls, type NewCall } from "./calls";
import { cleanCriteria, type Criteria } from "./criteria";
import { todayYmd } from "./deadline";
import { FEEDS, type Feed } from "./feeds";
import { TRACK_STATUSES, fromProgram, isCallId, type Bourse, type TrackStatus, type Tracking } from "./model";
import { PROGRAMS } from "./programs";

type Row = Record<string, unknown>;

export function ensureBoursesSchema(): void {
  migrate(
    "bourses:001-calls-tracking",
    `CREATE TABLE IF NOT EXISTS bourse_calls (
       id INTEGER PRIMARY KEY,
       url_key TEXT NOT NULL UNIQUE,
       url TEXT NOT NULL,
       feed TEXT NOT NULL,
       title TEXT NOT NULL,
       tags TEXT NOT NULL DEFAULT '[]',
       levels TEXT NOT NULL DEFAULT '[]',
       fields TEXT NOT NULL DEFAULT '[]',
       countries TEXT NOT NULL DEFAULT '[]',
       funding TEXT,
       deadline TEXT,
       tn_eligible INTEGER,
       program_id TEXT,
       published_at TEXT,
       first_seen TEXT NOT NULL,
       last_seen TEXT NOT NULL,
       closed_at TEXT
     );
     CREATE INDEX IF NOT EXISTS bourse_calls_feed ON bourse_calls(feed);
     CREATE TABLE IF NOT EXISTS bourse_tracking (
       item TEXT PRIMARY KEY,
       status TEXT NOT NULL DEFAULT 'saved',
       notes TEXT NOT NULL DEFAULT '',
       checklist TEXT NOT NULL DEFAULT '{}',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     );`,
  );
}

const json = <T,>(v: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(v ?? "")) as T;
  } catch {
    return fallback;
  }
};

// ---------- live calls ----------

export interface StoredCall extends NewCall {
  id: number;
  firstSeen: string;
  lastSeen: string;
  closedAt: string | null;
}

const toCall = (r: Row): StoredCall => ({
  id: r.id as number,
  urlKey: r.url_key as string,
  url: r.url as string,
  feed: r.feed as string,
  title: r.title as string,
  tags: json(r.tags, []),
  levels: json(r.levels, []),
  fields: json(r.fields, []),
  countries: json(r.countries, []),
  funding: (r.funding as StoredCall["funding"]) ?? null,
  deadline: (r.deadline as string) ?? null,
  tunisia: r.tn_eligible === null || r.tn_eligible === undefined ? null : r.tn_eligible === 1,
  programId: (r.program_id as string) ?? null,
  published: (r.published_at as string) ?? null,
  firstSeen: r.first_seen as string,
  lastSeen: r.last_seen as string,
  closedAt: (r.closed_at as string) ?? null,
});

/** What a re-scan may change in a call. */
const content = (c: NewCall) => JSON.stringify([c.url, c.title, c.tags, c.levels, c.fields, c.countries, c.funding, c.deadline, c.tunisia, c.programId]);

/**
 * Store what a scan read: a new URL is added, a known one gets its last_seen moved (and its facts when they changed).
 * A call that comes back after being closed is open again, unless its deadline has passed.
 */
export function upsertCalls(calls: NewCall[], now: string, today = todayYmd()): { added: number; updated: number; unchanged: number } {
  ensureBoursesSchema();
  const d = db();
  const get = d.prepare("SELECT * FROM bourse_calls WHERE url_key = ?");
  const ins = d.prepare(
    `INSERT INTO bourse_calls (url_key, url, feed, title, tags, levels, fields, countries, funding, deadline, tn_eligible, program_id, published_at, first_seen, last_seen)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const upd = d.prepare(
    `UPDATE bourse_calls SET url=?, feed=?, title=?, tags=?, levels=?, fields=?, countries=?, funding=?, deadline=?, tn_eligible=?, program_id=?, published_at=?, last_seen=?, closed_at=? WHERE id=?`,
  );
  const out = { added: 0, updated: 0, unchanged: 0 };
  d.exec("BEGIN");
  try {
    for (const c of calls) {
      const row = get.get(c.urlKey) as Row | undefined;
      const tn = c.tunisia === null ? null : Number(c.tunisia);
      const facts = [JSON.stringify(c.tags), JSON.stringify(c.levels), JSON.stringify(c.fields), JSON.stringify(c.countries), c.funding, c.deadline, tn, c.programId, c.published] as const;
      if (!row) {
        ins.run(c.urlKey, c.url, c.feed, c.title, ...facts, now, now);
        out.added++;
        continue;
      }
      const old = toCall(row);
      const stillClosed = old.closedAt && c.deadline && c.deadline < today ? old.closedAt : null;
      upd.run(c.url, c.feed, c.title, ...facts, now, stillClosed, old.id);
      if ((old.closedAt && !stillClosed) || content(old) !== content(c)) out.updated++;
      else out.unchanged++;
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return out;
}

/**
 * Mark calls closed, never delete them: every call whose deadline has passed, and the calls of `feedId` that its feed
 * no longer lists (not seen at `now`). A vanished call that states a deadline still ahead stays open until that day:
 * feeds only list their latest items.
 */
export function closeCalls(feedId: string | null, now: string, today = todayYmd()): number {
  ensureBoursesSchema();
  const d = db();
  let n = Number(d.prepare("UPDATE bourse_calls SET closed_at = ? WHERE closed_at IS NULL AND deadline IS NOT NULL AND deadline < ?").run(now, today).changes);
  if (feedId) n += Number(d.prepare("UPDATE bourse_calls SET closed_at = ? WHERE closed_at IS NULL AND feed = ? AND last_seen < ? AND deadline IS NULL").run(now, feedId, now).changes);
  return n;
}

export function listCalls(): StoredCall[] {
  ensureBoursesSchema();
  return (db().prepare("SELECT * FROM bourse_calls ORDER BY first_seen DESC, id DESC").all() as Row[]).map(toCall);
}

const feedLabel = (id: string) => FEEDS.find((f) => f.id === id)?.label ?? id;

/** A stored call as the engine reads it. Facts its text does not give come from the curated programme it names. */
export function callBourse(c: StoredCall, today = todayYmd()): Bourse {
  const p = c.programId ? PROGRAMS.find((x) => x.id === c.programId) : undefined;
  return {
    id: `call-${c.id}`,
    kind: "call",
    name: c.title,
    provider: p?.provider ?? feedLabel(c.feed),
    hostCountries: c.countries.length ? c.countries : (p?.hostCountries ?? []),
    levels: c.levels.length ? c.levels : (p?.levels ?? []),
    fields: c.fields.length ? c.fields : (p?.fields ?? []),
    funding: c.funding ?? p?.funding ?? null,
    covers: p?.covers ?? null,
    monthlyStipend: p?.monthlyStipend,
    applicationFee: p?.applicationFee ?? null,
    eligibleNationalities: p?.eligibleNationalities ?? null,
    tunisiaEligible: c.tunisia ?? p?.tunisiaEligible ?? null,
    languages: p?.languages ?? [],
    languageTests: p?.languageTests,
    ageLimit: p?.ageLimit,
    deadline: c.deadline ?? undefined,
    url: c.url,
    summary: { en: "", fr: "" },
    providerType: p?.providerType,
    tags: c.tags,
    published: c.published,
    feed: c.feed,
    firstSeen: c.firstSeen,
    lastSeen: c.lastSeen,
    closed: !!c.closedAt || (!!c.deadline && c.deadline < today),
    programId: p ? p.id : null,
  };
}

/** The curated catalogue and the stored calls, in one shape. */
export function allBourses(today = todayYmd()): { programs: Bourse[]; calls: Bourse[] } {
  return { programs: PROGRAMS.map(fromProgram), calls: listCalls().map((c) => callBourse(c, today)) };
}

/** A programme by slug or a call by "call-<n>"; null when it does not exist (any more). */
export function findBourse(id: string, today = todayYmd()): Bourse | null {
  if (!isCallId(id)) {
    const p = PROGRAMS.find((x) => x.id === id);
    return p ? fromProgram(p) : null;
  }
  ensureBoursesSchema();
  const row = db().prepare("SELECT * FROM bourse_calls WHERE id = ?").get(Number(id.slice(5))) as Row | undefined;
  return row ? callBourse(toCall(row), today) : null;
}

// ---------- the student's tracking ----------

const toTracking = (r: Row): Tracking => ({
  item: r.item as string,
  status: (TRACK_STATUSES as readonly string[]).includes(r.status as string) ? (r.status as TrackStatus) : "saved",
  notes: r.notes as string,
  checklist: json(r.checklist, {}),
  created_at: r.created_at as string,
  updated_at: r.updated_at as string,
});

export function listTracking(): Tracking[] {
  ensureBoursesSchema();
  return (db().prepare("SELECT * FROM bourse_tracking ORDER BY updated_at DESC").all() as Row[]).map(toTracking);
}

export function getTracking(item: string): Tracking | null {
  ensureBoursesSchema();
  const r = db().prepare("SELECT * FROM bourse_tracking WHERE item = ?").get(item) as Row | undefined;
  return r ? toTracking(r) : null;
}

/** Start tracking `item` (status "saved") or change what is tracked; fields left out keep their value. */
export function track(item: string, patch: Partial<Pick<Tracking, "status" | "notes" | "checklist">> = {}, now = new Date().toISOString()): Tracking {
  const cur = getTracking(item);
  const next = { status: "saved" as TrackStatus, notes: "", checklist: {}, ...cur, ...patch };
  db()
    .prepare(
      `INSERT INTO bourse_tracking (item, status, notes, checklist, created_at, updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(item) DO UPDATE SET status=excluded.status, notes=excluded.notes, checklist=excluded.checklist, updated_at=excluded.updated_at`,
    )
    .run(item, next.status, next.notes, JSON.stringify(next.checklist), now, now);
  return getTracking(item)!;
}

export function untrack(item: string): void {
  ensureBoursesSchema();
  db().prepare("DELETE FROM bourse_tracking WHERE item = ?").run(item);
}

// ---------- scanning the feeds ----------

export interface FeedResult {
  id: string;
  /** cached: read less than 15 minutes ago, not fetched again. */
  state: "done" | "error" | "cached";
  at: string;
  /** Items in the feed, and how many of them are scholarships. */
  items: number;
  kept: number;
  added: number;
  updated: number;
  unchanged: number;
  error?: string;
}
export interface ScanState {
  /** End of the last scan, ISO. */
  at: string | null;
  feeds: Record<string, FeedResult>;
}
export type ScanEvent =
  | { type: "plan"; feeds: { id: string; label: string }[] }
  | { type: "feed"; id: string; state: "running" }
  | ({ type: "feed" } & FeedResult)
  | { type: "done"; at: string; added: number; updated: number; unchanged: number; closed: number; failed: number };

const SCAN_KEY = "bourses:scan";
/** Two scans in a row do not fetch a feed twice. */
export const FEED_CACHE_MS = 15 * 60_000;
const ACCEPT = { rss: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5", atom: "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5", json: "application/json, application/feed+json;q=0.9, */*;q=0.5" };

export const scanState = (): ScanState => kvGet<ScanState>(SCAN_KEY, { at: null, feeds: {} });

const g = globalThis as { __khedmaBoursesScan?: boolean };
export const scanRunning = () => !!g.__khedmaBoursesScan;

/**
 * Read every feed (three at a time), store the scholarship calls and report per feed. A feed that fails keeps its
 * stored calls and says why. Returns null when a scan is already running.
 */
export async function scanFeeds(opts: {
  force?: boolean;
  onEvent?: (e: ScanEvent) => void;
  feeds?: Feed[];
  fetcher?: (feed: Feed) => Promise<{ text: string; error?: string }>;
  now?: () => Date;
} = {}): Promise<ScanState | null> {
  if (g.__khedmaBoursesScan) return null;
  g.__khedmaBoursesScan = true;
  try {
    ensureBoursesSchema();
    const feeds = opts.feeds ?? FEEDS;
    const clock = opts.now ?? (() => new Date());
    const fetcher = opts.fetcher ?? ((f: Feed) => getText(f.url, ACCEPT[f.format], { timeoutMs: 15_000 }));
    const emit = opts.onEvent ?? (() => {});
    const before = scanState();
    const results: Record<string, FeedResult> = {};
    let closed = 0;
    emit({ type: "plan", feeds: feeds.map((f) => ({ id: f.id, label: f.label })) });

    await mapLimit(
      feeds,
      3,
      async (feed) => {
        const prev = before.feeds[feed.id];
        if (!opts.force && prev && prev.state !== "error" && clock().getTime() - new Date(prev.at).getTime() < FEED_CACHE_MS) {
          results[feed.id] = { ...prev, state: "cached", added: 0, updated: 0, unchanged: prev.kept };
          emit({ type: "feed", ...results[feed.id] });
          return;
        }
        emit({ type: "feed", id: feed.id, state: "running" });
        const now = clock().toISOString();
        const fail = (error: string): FeedResult => ({ id: feed.id, state: "error", at: now, items: 0, kept: 0, added: 0, updated: 0, unchanged: 0, error });
        let res: FeedResult;
        const { text, error } = await fetcher(feed);
        if (error) res = fail(error);
        else if (feed.format !== "json" && !/<(rss|feed|rdf:RDF)\b/i.test(text)) res = fail(`Not an RSS/Atom feed: ${feed.url}`);
        else {
          try {
            const items = parseFeed(text, feed.format);
            const calls = toCalls(items, feed, PROGRAMS, todayYmd());
            const counts = upsertCalls(calls, now);
            // An answer with no items at all looks like a broken feed, not like every call closing at once.
            closed += closeCalls(items.length ? feed.id : null, now);
            res = { id: feed.id, state: "done", at: now, items: items.length, kept: calls.length, ...counts };
          } catch (e) {
            res = fail(`Feed parse failed: ${(e as Error).message}`);
          }
        }
        results[feed.id] = res;
        emit({ type: "feed", ...res });
      },
      250,
    );

    const at = clock().toISOString();
    closed += closeCalls(null, at);
    const state: ScanState = { at, feeds: results };
    kvSet(SCAN_KEY, state);
    const sum = (k: "added" | "updated" | "unchanged") => Object.values(results).reduce((n, r) => n + r[k], 0);
    emit({ type: "done", at, added: sum("added"), updated: sum("updated"), unchanged: sum("unchanged"), closed, failed: Object.values(results).filter((r) => r.state === "error").length });
    return state;
  } finally {
    g.__khedmaBoursesScan = false;
  }
}

// ---------- the last search ----------

const CRITERIA_KEY = "bourses:criteria";
/** The criteria of the last search, or null before the first one (the page then starts from the profile). */
export const lastCriteria = (): Criteria | null => {
  const raw = kvGet<unknown>(CRITERIA_KEY, null);
  return raw ? cleanCriteria(raw) : null;
};
export const rememberCriteria = (c: Criteria): void => kvSet(CRITERIA_KEY, c);
