// Reports data access: everything the digest, the history table and the
// exports need, read once from the shared tables plus the apply packs.
import { db, getProfile } from "../db";
import { listPacks, type Channel, type Outcome } from "../apply/repo";
import type { AppState, Evaluation } from "../types";
import { addDays, buildDigest, localDate, toLocalDay, weekStart, type Digest, type DigestApp, type DigestInput } from "./digest";

type Row = Record<string, unknown>;

export interface HistoryRow extends DigestApp {
  type: string;
  channel: Channel | null;
  outcome: Outcome | null;
  outcome_reason: string;
  updated_at: string;
}

export interface ReportsData {
  apps: HistoryRow[];
  digestInput: Omit<DigestInput, "weekStart">;
  interviews: { application_id: number; starts_at: string; kind: string; outcome: string }[];
}

export function loadReportsData(): ReportsData {
  const d = db();
  const packs = listPacks();
  const jobs = d.prepare("SELECT id, title, company, type, created_at, deadline, archived FROM jobs").all() as Row[];
  const evals = d.prepare("SELECT job_id, created_at, global, verdict FROM evaluations ORDER BY created_at, id").all() as Row[];
  const latestEval = new Map<number, { global: number; verdict: string }>();
  for (const e of evals) latestEval.set(e.job_id as number, { global: e.global as number, verdict: e.verdict as string });
  const jobById = new Map(jobs.map((j) => [j.id as number, j]));
  const apps = (d.prepare("SELECT * FROM applications ORDER BY updated_at DESC").all() as Row[])
    .filter((a) => jobById.has(a.job_id as number))
    .map((a): HistoryRow => {
      const j = jobById.get(a.job_id as number)!;
      const p = packs.get(a.id as number);
      const ev = latestEval.get(j.id as number);
      return {
        id: a.id as number,
        status: a.status as AppState,
        applied_at: (a.applied_at as string) ?? null,
        created_at: a.created_at as string,
        updated_at: a.updated_at as string,
        type: j.type as string,
        job: { id: j.id as number, title: j.title as string, company: j.company as string, deadline: (j.deadline as string) ?? null, created_at: j.created_at as string, archived: !!j.archived },
        score: ev?.global ?? null,
        verdict: (ev?.verdict as Evaluation["verdict"]) ?? null,
        channel: p?.channel ?? null,
        outcome: p?.outcome ?? null,
        outcome_reason: p?.outcome_reason ?? "",
        outcome_at: p?.outcome_at ?? null,
        lesson: p?.lesson ?? "",
      };
    });
  const statusEvents = d.prepare("SELECT application_id, payload, created_at FROM events WHERE kind = 'status'").all() as unknown as DigestInput["statusEvents"];
  const interviews = d.prepare("SELECT application_id, starts_at, kind, outcome FROM interviews ORDER BY starts_at").all() as unknown as ReportsData["interviews"];
  return {
    apps,
    interviews,
    digestInput: {
      jobs: jobs.map((j) => ({ id: j.id as number, title: j.title as string, company: j.company as string, created_at: j.created_at as string, deadline: (j.deadline as string) ?? null, archived: !!j.archived })),
      evaluations: evals.map((e) => ({ job_id: e.job_id as number, created_at: e.created_at as string, global: e.global as number })),
      apps,
      statusEvents,
      interviews,
    },
  };
}

export function weeklyDigest(week: string, data = loadReportsData()): Digest {
  return buildDigest({ ...data.digestInput, weekStart: weekStart(week) });
}

/** Range from ?range=: "week:YYYY-MM-DD", "30", "90" or "all" (default). */
export function parseRange(raw: string | null | undefined, today = localDate(new Date())): { kind: "week" | "days" | "all"; from: string | null; to: string | null; week: string | null } {
  if (raw?.startsWith("week:")) {
    const ws = weekStart(raw.slice(5));
    return { kind: "week", from: ws, to: addDays(ws, 6), week: ws };
  }
  if (raw === "30" || raw === "90") return { kind: "days", from: addDays(today, -Number(raw)), to: today, week: null };
  return { kind: "all", from: null, to: null, week: null };
}

/** Applications active in the range: created, applied, updated or concluded inside it. */
export function filterApps(apps: HistoryRow[], r: ReturnType<typeof parseRange>): HistoryRow[] {
  if (!r.from || !r.to) return apps;
  const hit = (s: string | null) => {
    const day = toLocalDay(s);
    return !!day && day >= r.from! && day <= r.to!;
  };
  return apps.filter((a) => hit(a.created_at) || hit(a.applied_at) || hit(a.updated_at) || hit(a.outcome_at));
}

export const ownerName = () => getProfile().name;
