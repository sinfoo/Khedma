// Evaluation v2 storage: extra JSON columns on the evaluations row, triage settings, priority companies.
import { db, insertEvaluation, kvGet, kvSet, migrate } from "../db";
import type { Evaluation } from "../types";
import { normalizeCompany } from "../company/normalize";

type Row = Record<string, unknown>;
const V2_COLS = ["requirements", "legitimacy", "company_type", "comp_reliability", "level_plan", "cv_changes", "archetype", "triage"] as const;
type V2Col = (typeof V2_COLS)[number];
const JSON_COLS: V2Col[] = ["requirements", "legitimacy", "cv_changes", "triage"];

function schema() {
  migrate("eval:001-v2", V2_COLS.map((c) => `ALTER TABLE evaluations ADD COLUMN ${c} TEXT;`).join("\n"));
}

function parse<T>(s: unknown, fallback: T): T {
  try {
    return s ? (JSON.parse(String(s)) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Fold the v2 columns of a raw evaluations row into an Evaluation. */
export function withV2(e: Evaluation, r: Row): Evaluation {
  const out: Evaluation = { ...e };
  for (const c of V2_COLS) {
    const v = r[c];
    if (v === null || v === undefined || v === "") continue;
    (out as unknown as Record<string, unknown>)[c] = JSON_COLS.includes(c) ? parse(v, undefined) : String(v);
  }
  return out;
}

export function insertEvaluationV2(e: Omit<Evaluation, "id" | "created_at">): Evaluation {
  schema();
  const row = insertEvaluation(e);
  const vals = V2_COLS.map((c) => {
    const v = (e as unknown as Record<string, unknown>)[c];
    if (v === undefined || v === null) return null;
    return JSON_COLS.includes(c) ? JSON.stringify(v) : String(v);
  });
  db().prepare(`UPDATE evaluations SET ${V2_COLS.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(...vals, row.id);
  return getEvaluationV2(row.id) ?? row;
}

export function getEvaluationV2(id: number): Evaluation | null {
  schema();
  const r = db().prepare("SELECT * FROM evaluations WHERE id = ?").get(id) as Row | undefined;
  return r ? withV2(base(r), r) : null;
}

export function latestEvaluationV2(jobId: number): Evaluation | null {
  schema();
  const r = db().prepare("SELECT * FROM evaluations WHERE job_id = ? ORDER BY created_at DESC, id DESC LIMIT 1").get(jobId) as Row | undefined;
  return r ? withV2(base(r), r) : null;
}

const base = (r: Row): Evaluation => ({
  id: r.id as number,
  job_id: r.job_id as number,
  global: r.global as number,
  match: r.match as number,
  target: r.target as number,
  growth: r.growth as number,
  culture: r.culture as number,
  red_flags: r.red_flags as number,
  strengths: parse<string[]>(r.strengths, []),
  gaps: parse<string[]>(r.gaps, []),
  flags: parse<string[]>(r.flags, []),
  verdict: r.verdict as Evaluation["verdict"],
  summary: r.summary as string,
  engine: r.engine as string,
  created_at: r.created_at as string,
});

// ---------- triage settings ----------
const MARGINALS_KEY = "eval:triage_marginals";
export const getTriageMarginals = () => kvGet<boolean>(MARGINALS_KEY, false);
export const setTriageMarginals = (on: boolean) => kvSet(MARGINALS_KEY, !!on);

/** Starred offers, companies already in the pipeline, or rated ≥ 4 skip the triage gate. */
export function isPriorityCompany(job: { id: number; company: string; starred: boolean }): boolean {
  if (job.starred) return true;
  const d = db();
  const key = normalizeCompany(job.company);
  if (key) {
    const rows = d.prepare("SELECT j.company FROM applications a JOIN jobs j ON j.id = a.job_id").all() as Row[];
    if (rows.some((r) => normalizeCompany(String(r.company)) === key)) return true;
  }
  try {
    const rated = d.prepare("SELECT name FROM companies WHERE rating >= 4").all() as Row[];
    if (rated.some((r) => normalizeCompany(String(r.name ?? "")) === key)) return true;
  } catch {
    // companies table not created yet (company area not visited)
  }
  return false;
}
