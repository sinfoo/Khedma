// Offers area: filtering, duplicates, saved views, paste parsing, CSV, soft-delete snapshots.
import { randomUUID } from "node:crypto";
import { db, getProfile, kvGet, kvSet, listJobs, type JobWithMeta, type NewJob } from "@/lib/db";
import type { Evaluation } from "@/lib/types";
import { extractTags, guessType } from "@/lib/sources";
import { fold, guessRemote } from "@/lib/sources/classify";
import { getCvSource } from "@/lib/cv/source";
import { dedupeKey } from "@/lib/sources/classify";
import { postingCounts } from "@/lib/search/store";
import { evergreenReasons } from "@/lib/evergreen";

// ---------- filters (pure, client-safe) ----------
export { VERDICTS, SORTS, parseFilters, filtersToQuery, applyFilters } from "../offers-filter";
export type { Sort, OfferFilters, OfferRow } from "../offers-filter";
import { type OfferFilters, type OfferRow, applyFilters } from "../offers-filter";

const toRow = (j: JobWithMeta, dup: OfferRow["dup"], postings = 0): OfferRow => ({
  id: j.id,
  title: j.title,
  company: j.company,
  location: j.location,
  remote: j.remote,
  type: j.type,
  source: j.source,
  url: j.url,
  tags: j.tags.slice(0, 6),
  deadline: j.deadline,
  created_at: j.created_at,
  archived: j.archived,
  starred: j.starred,
  score: j.evaluation?.global ?? null,
  verdict: j.evaluation?.verdict ?? null,
  engine: j.evaluation?.engine ?? null,
  appId: j.application?.id ?? null,
  status: j.application?.status ?? null,
  dup,
  evergreen: evergreenReasons(j.description, postings),
});

/** All offers in the archived/active bucket, with duplicate flags. Filtering is done in memory. */
// ponytail: loads the whole bucket then filters in JS; fine for thousands of offers, move filters to SQL beyond that.
export function listOfferRows(archived = false): OfferRow[] {
  const jobs = listJobs({ archived });
  const dups = findDuplicates(jobs);
  const postings = postingCounts();
  return jobs.map((j) => toRow(j, dups.get(j.id) ?? null, postings.get(dedupeKey(j.company, j.title))));
}

export function listOffers(f: OfferFilters): OfferRow[] {
  return applyFilters(listOfferRows(f.archived), f);
}

export function unevaluated(): { id: number; title: string }[] {
  const rows = db()
    .prepare("SELECT id, title FROM jobs WHERE archived = 0 AND id NOT IN (SELECT job_id FROM evaluations) ORDER BY created_at DESC, id DESC")
    .all() as { id: number; title: string }[];
  return rows.map((r) => ({ id: r.id, title: r.title })); // sqlite rows have a null prototype; clients need plain objects
}

export function listSources(): string[] {
  return (db().prepare("SELECT DISTINCT source FROM jobs ORDER BY source").all() as { source: string }[]).map((r) => r.source);
}

// ---------- duplicates ----------
const COMPANY_NOISE = /\b(sarl|suarl|sa|sas|sasu|inc|ltd|llc|gmbh|group|groupe|tunisie|tunisia|tn|corp|co)\b/g;
export const normalizeCompany = (s: string) =>
  fold(s).replace(/[^\p{L}\p{N} ]/gu, " ").replace(COMPANY_NOISE, " ").replace(/\s+/g, " ").trim();

const TITLE_NOISE = new Set(["h", "f", "hf", "m", "w", "x", "de", "du", "des", "en", "et", "la", "le", "les", "a", "an", "the", "of", "for", "and", "in"]);
export const titleTokens = (s: string) =>
  new Set(fold(s).split(/[^\p{L}\p{N}+#]+/u).filter((t) => t && !TITLE_NOISE.has(t)));

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Same normalized company and title token Jaccard >= 0.7. Each flagged offer points at its twin;
 * `newer` marks the one a merge should archive (the later-added copy).
 */
// ponytail: O(n²) within each company bucket; fine for the sizes a student collects.
export function findDuplicates(jobs: { id: number; company: string; title: string; created_at: string }[]) {
  const out = new Map<number, { id: number; title: string; newer: boolean }>();
  const byCompany = new Map<string, typeof jobs>();
  for (const j of jobs) {
    const k = normalizeCompany(j.company);
    if (!k) continue;
    byCompany.set(k, [...(byCompany.get(k) ?? []), j]);
  }
  for (const group of byCompany.values()) {
    const sorted = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
    for (let i = 0; i < sorted.length; i++) {
      for (let k = i + 1; k < sorted.length; k++) {
        const a = sorted[i];
        const b = sorted[k];
        if (jaccard(titleTokens(a.title), titleTokens(b.title)) < 0.7) continue;
        if (!out.has(b.id) || !out.get(b.id)!.newer) out.set(b.id, { id: a.id, title: a.title, newer: true });
        if (!out.has(a.id)) out.set(a.id, { id: b.id, title: b.title, newer: false });
      }
    }
  }
  return out;
}

// ---------- saved views ----------
export interface SavedView {
  id: string;
  name: string;
  query: string;
}
const VIEWS_KEY = "offers:views";
export const listViews = () => kvGet<SavedView[]>(VIEWS_KEY, []);
export function saveView(name: string, query: string): SavedView {
  const v = { id: randomUUID().slice(0, 8), name, query };
  kvSet(VIEWS_KEY, [...listViews().filter((x) => x.query !== query), v].slice(-20));
  return v;
}
export const deleteView = (id: string) => kvSet(VIEWS_KEY, listViews().filter((v) => v.id !== id));

// ---------- evaluation history ----------
export type EvalPoint = Pick<Evaluation, "id" | "global" | "verdict" | "engine" | "created_at">;
export function listEvaluationHistory(jobId: number): EvalPoint[] {
  return db()
    .prepare("SELECT id, global, verdict, engine, created_at FROM evaluations WHERE job_id = ? ORDER BY created_at DESC, id DESC LIMIT 20")
    .all(jobId) as unknown as EvalPoint[];
}

// ---------- CV used for keyword matching ----------
/** CV text (Markdown CV, else the uploaded file's text) plus declared skills. `fileName` is set when the file text is used. */
export function cvForMatching(): { text: string; fileName: string | null; empty: boolean } {
  const src = getCvSource();
  return {
    text: `${getProfile().skills.join(", ")}\n${src.text}`.trim(),
    fileName: src.format === "text" ? src.fileName : null,
    empty: !src.text.trim(),
  };
}

// ---------- soft delete (undo) ----------
type Rows = Record<string, unknown>[];
/** One table's saved rows, in restore order (parents first). `col` points at the parent; `cascade` is false when deleting only unlinks the row. */
interface SnapPart { table: string; col: string | null; cascade: boolean; rows: Rows }
const TRASH_KEY = "offers:trash";

/** Tables with a foreign key to `parent`, read from the schema so feature tables added later are covered too. */
const childTables = (parent: string) =>
  db()
    .prepare(`SELECT m.name AS t, f."from" AS col, COALESCE(f."to", 'id') AS ref, f.on_delete AS del FROM sqlite_master m, pragma_foreign_key_list(m.name) f WHERE m.type = 'table' AND f."table" = ?`)
    .all(parent) as { t: string; col: string; ref: string; del: string }[];

/**
 * Delete offers, keeping a snapshot (one undo level) of every row that hangs off them: evaluations, checks, the
 * application and everything under it (events, interviews, reminders, extras with the per-application CV, answers,
 * pack, offer terms), and the link of contacts and coach sessions, which deleting only unlinks. Returns the undo token.
 */
export function deleteWithUndo(ids: number[]): string {
  const d = db();
  const marks = (n: number) => Array(n).fill("?").join(",");
  const parts: SnapPart[] = [{ table: "jobs", col: null, cascade: true, rows: d.prepare(`SELECT * FROM jobs WHERE id IN (${marks(ids.length)})`).all(...ids) as Rows }];
  // Walk down the foreign keys; unlinked (SET NULL) rows survive the delete, so their own children are not saved.
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].cascade) continue;
    for (const c of childTables(parts[i].table)) {
      const keys = [...new Set(parts[i].rows.map((r) => r[c.ref]).filter((v) => v !== null && v !== undefined))] as (string | number)[];
      if (!keys.length) continue;
      const rows = d.prepare(`SELECT * FROM ${c.t} WHERE ${c.col} IN (${marks(keys.length)})`).all(...keys) as Rows;
      if (rows.length) parts.push({ table: c.t, col: c.col, cascade: c.del === "CASCADE", rows });
    }
  }
  const appIds = parts.filter((p) => p.table === "applications").flatMap((p) => p.rows.map((r) => r.id as number));
  // Per-application values kept in kv: offer terms and the employer-form fields.
  const kvKeys = appIds.flatMap((id) => [`offer:${id}`, `apply:fields:${id}`]);
  const kv = Object.fromEntries(kvKeys.map((k) => [k, kvGet<unknown>(k, null)]).filter(([, v]) => v !== null));
  const token = randomUUID();
  kvSet(TRASH_KEY, { token, parts, kv });
  d.prepare(`DELETE FROM jobs WHERE id IN (${marks(ids.length)})`).run(...ids);
  return token;
}

/** Put back everything `deleteWithUndo` saved; rows that survived the delete (contacts) are linked again. */
export function restoreDeleted(token: string): number {
  const trash = kvGet<{ token: string; parts?: SnapPart[]; kv?: Record<string, unknown> } | null>(TRASH_KEY, null);
  if (!trash || trash.token !== token || !trash.parts) return 0;
  const d = db();
  d.exec("BEGIN");
  try {
    for (const p of trash.parts) {
      for (const row of p.rows) {
        const cols = Object.keys(row);
        const onConflict = p.col ? `UPDATE SET ${p.col} = excluded.${p.col}` : "NOTHING";
        d.prepare(`INSERT INTO ${p.table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")}) ON CONFLICT DO ${onConflict}`).run(
          ...(cols.map((c) => row[c]) as (string | number | null)[]),
        );
      }
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  for (const [k, v] of Object.entries(trash.kv ?? {})) kvSet(k, v);
  kvSet(TRASH_KEY, null);
  return trash.parts[0]?.rows.length ?? 0;
}

// ---------- paste parser ----------
const CITIES = [
  "Tunis", "Ariana", "Ben Arous", "La Marsa", "Les Berges du Lac", "Lac 1", "Lac 2", "Charguia", "Manouba", "Sousse", "Sfax",
  "Monastir", "Nabeul", "Hammamet", "Bizerte", "Gabès", "Kairouan", "Mahdia", "Béja", "Gafsa", "Médenine", "Djerba", "Zaghouan",
  "Paris", "Lyon", "Montréal", "Berlin", "Remote", "Télétravail",
];
const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, janvier: 1, january: 1, fev: 2, fevr: 2, fevrier: 2, feb: 2, february: 2, mars: 3, mar: 3, march: 3,
  avr: 4, avril: 4, apr: 4, april: 4, mai: 5, may: 5, juin: 6, jun: 6, june: 6, juil: 7, juillet: 7, jul: 7, july: 7,
  aout: 8, aug: 8, august: 8, sept: 9, sep: 9, septembre: 9, september: 9, oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11, dec: 12, decembre: 12, december: 12,
};
const LABEL = (names: string) => new RegExp(`^\\s*(?:${names})\\s*[:：-]\\s*(.+)$`, "i");
const TITLE_RE = LABEL("poste|intitul[ée] du poste|intitul[ée]|titre|job title|title|position|role|r[ôo]le");
const COMPANY_RE = LABEL("entreprise|soci[ée]t[ée]|company|employer|employeur|organisation|organization|client");
const LOCATION_RE = LABEL("lieu|localisation|location|ville|city|adresse|address|lieu de travail");
const DEADLINE_HINT = /date limite|deadline|avant le|before|cl[ôo]ture|apply by|jusqu'?au|until|expire/i;

const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};

/** Dates found in a line, as yyyy-mm-dd. Understands 15/11/2026, 2026-11-15, 15 novembre 2026, November 15, 2026. */
export function findDates(line: string): string[] {
  const out: string[] = [];
  const s = fold(line);
  for (const m of s.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) out.push(iso(+m[1], +m[2], +m[3]) ?? "");
  for (const m of s.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g)) out.push(iso(+m[3], +m[2], +m[1]) ?? "");
  for (const m of s.matchAll(/\b(\d{1,2})(?:er)?\s+([a-z]{3,9})\.?\s+(\d{4})\b/g)) if (MONTHS[m[2]]) out.push(iso(+m[3], MONTHS[m[2]], +m[1]) ?? "");
  for (const m of s.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) if (MONTHS[m[1]]) out.push(iso(+m[3], MONTHS[m[1]], +m[2]) ?? "");
  return out.filter(Boolean);
}

export type PastedOffer = Pick<NewJob, "title" | "company" | "location" | "type" | "deadline" | "remote" | "tags" | "description">;

export function parsePastedOffer(text: string, now = new Date()): PastedOffer {
  const description = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20_000);
  const lines = description.split("\n").map((l) => l.replace(/^[\s#*•·>-]+/, "").trim()).filter(Boolean);
  const pick = (re: RegExp) => {
    for (const l of lines) {
      const m = l.match(re);
      if (m) return m[1].trim().replace(/[.;]+$/, "").slice(0, 200);
    }
    return "";
  };
  let title = pick(TITLE_RE);
  let company = pick(COMPANY_RE);
  let location = pick(LOCATION_RE);

  if (!title) {
    const first = lines.find((l) => !COMPANY_RE.test(l) && !LOCATION_RE.test(l) && !DEADLINE_HINT.test(l)) ?? "";
    title = first.slice(0, 200);
    // "Title chez Company", "Title at Company", "Title @ Company", or "Title – Company" when the right side looks like a name.
    const at = first.match(/^(.{3,}?)\s+(?:chez|at|@)\s+(.{2,})$/i);
    const dash = first.match(/^(.{3,})\s+[–—|-]\s+([^–—|-]{2,})$/);
    const jobWord = /stag|pfe|intern|dev|engineer|data|web|full|back|front|software|analyst|manager/;
    const split = at ?? (dash && dash[2].trim().split(/\s+/).length <= 3 && !jobWord.test(fold(dash[2])) ? dash : null);
    if (split) {
      title = split[1].trim();
      if (!company) company = split[2].trim().replace(/[.;]+$/, "");
    }
  }
  if (!company) {
    const m = description.match(/(?:^|\n)\s*([A-Z][\w&.' -]{1,40}?)\s+(?:recrute|is hiring|recherche|is looking for)\b/);
    if (m) company = m[1].trim();
  }
  if (!location) {
    const hay = fold(description);
    location = CITIES.find((c) => new RegExp(`\\b${fold(c)}\\b`).test(hay)) ?? "";
  }

  const today = now.toISOString().slice(0, 10);
  const labelled = lines.filter((l) => DEADLINE_HINT.test(l)).flatMap(findDates);
  const future = lines.flatMap(findDates).filter((d) => d >= today);
  const deadline = labelled[0] ?? future[0] ?? null;

  return {
    title,
    company,
    location,
    type: guessType(title, description),
    deadline,
    remote: guessRemote(description),
    tags: extractTags(title, description),
    description,
  };
}

// ---------- CSV ----------
/** RFC 4180 cell; also neutralises spreadsheet formulas (=, +, -, @ at the start). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
