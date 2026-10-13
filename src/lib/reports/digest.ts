// Weekly digest: pure week math and bucketing over plain rows, so it can be
// unit-tested without a database. Weeks start on Monday (local time).
import type { AppState } from "../types";

const pad = (n: number) => String(n).padStart(2, "0");
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Monday of the week containing `date` (YYYY-MM-DD or Date), as YYYY-MM-DD. */
export function weekStart(date: string | Date): string {
  const d = typeof date === "string" ? new Date(`${date.slice(0, 10)}T00:00`) : new Date(date);
  if (Number.isNaN(d.getTime())) return weekStart(new Date());
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return localDate(d);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

/** Local YYYY-MM-DD for an ISO timestamp (UTC "Z" ones are shifted to local), or the date part of a date-only string. */
export function toLocalDay(s: string | null | undefined): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : localDate(d);
}

export const inWeek = (day: string | null, start: string) => !!day && day >= start && day < addDays(start, 7);

/** Group items by the Monday of their week; items without a date are dropped. */
export function bucketByWeek<T>(items: T[], getDate: (x: T) => string | null | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const day = toLocalDay(getDate(it));
    if (!day) continue;
    const k = weekStart(day);
    out.set(k, [...(out.get(k) ?? []), it]);
  }
  return out;
}

export interface DigestApp {
  id: number;
  status: AppState;
  applied_at: string | null;
  created_at: string;
  job: { id: number; title: string; company: string; deadline: string | null; created_at: string; archived: boolean };
  score: number | null;
  verdict: string | null;
  lesson: string;
  outcome: string | null;
  outcome_at: string | null;
}

export interface DigestInput {
  weekStart: string;
  jobs: { id: number; title: string; company: string; created_at: string; deadline: string | null; archived: boolean }[];
  evaluations: { job_id: number; created_at: string; global: number }[];
  apps: DigestApp[];
  statusEvents: { application_id: number; payload: string; created_at: string }[];
  interviews: { application_id: number; starts_at: string; kind: string }[];
}

export type FocusKey = "evaluateBacklog" | "applyTop" | "followUp" | "deadlines" | "prepInterviews" | "findOffers" | "keepGoing";

export interface Digest {
  weekStart: string;
  weekEnd: string;
  newOffers: number;
  evaluated: number;
  applied: number;
  responses: number;
  interviews: { application_id: number; starts_at: string; kind: string; title: string; company: string }[];
  deadlinesNext: { application_id: number | null; job_id: number; title: string; company: string; deadline: string }[];
  top: { job_id: number; application_id: number | null; title: string; company: string; score: number; deadline: string | null }[];
  lessons: { application_id: number; title: string; company: string; lesson: string; outcome: string | null }[];
  focus: { key: FocusKey; vars: Record<string, string | number> }[];
}

const RESPONDED: AppState[] = ["responded", "interview", "offer", "hired"];
const OPEN: AppState[] = ["evaluated", "applied", "responded", "interview"];

export function buildDigest(d: DigestInput, today = localDate(new Date())): Digest {
  const ws = d.weekStart;
  const we = addDays(ws, 6);
  const nextStart = addDays(ws, 7);
  const appByJob = new Map(d.apps.map((a) => [a.job.id, a]));
  const label = (appId: number) => {
    const a = d.apps.find((x) => x.id === appId);
    return a ? { title: a.job.title, company: a.job.company } : { title: "#" + appId, company: "" };
  };

  const newOffers = d.jobs.filter((j) => inWeek(toLocalDay(j.created_at), ws)).length;
  const evaluated = new Set(d.evaluations.filter((e) => inWeek(toLocalDay(e.created_at), ws)).map((e) => e.job_id)).size;
  const applied = d.apps.filter((a) => inWeek(toLocalDay(a.applied_at), ws)).length;
  const responses = new Set(
    d.statusEvents.filter((e) => RESPONDED.includes(e.payload as AppState) && inWeek(toLocalDay(e.created_at), ws)).map((e) => e.application_id),
  ).size;
  const interviews = d.interviews
    .filter((i) => inWeek(toLocalDay(i.starts_at), ws))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((i) => ({ ...i, ...label(i.application_id) }));
  const deadlinesNext = d.jobs
    .filter((j) => !j.archived && inWeek(j.deadline, nextStart))
    .filter((j) => {
      const a = appByJob.get(j.id);
      return !a || OPEN.includes(a.status);
    })
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))
    .map((j) => ({ application_id: appByJob.get(j.id)?.id ?? null, job_id: j.id, title: j.title, company: j.company, deadline: j.deadline! }));

  const latest = new Map<number, number>();
  for (const e of d.evaluations) latest.set(e.job_id, e.global); // sorted ascending by caller: last wins
  const top = d.jobs
    .filter((j) => !j.archived && latest.has(j.id) && (!j.deadline || j.deadline >= today))
    .filter((j) => {
      const a = appByJob.get(j.id);
      return !a || a.status === "evaluated";
    })
    .map((j) => ({ job_id: j.id, application_id: appByJob.get(j.id)?.id ?? null, title: j.title, company: j.company, score: latest.get(j.id)!, deadline: j.deadline }))
    .sort((a, b) => b.score - a.score || (a.deadline ?? "9").localeCompare(b.deadline ?? "9"))
    .slice(0, 3);

  const lessons = d.apps
    .filter((a) => a.lesson.trim() && inWeek(toLocalDay(a.outcome_at), ws))
    .map((a) => ({ application_id: a.id, title: a.job.title, company: a.job.company, lesson: a.lesson, outcome: a.outcome }));

  // Suggested focus for next week: deterministic sentences, highest impact first.
  const focus: Digest["focus"] = [];
  const unevaluated = d.jobs.filter((j) => !j.archived && !latest.has(j.id)).length;
  const waiting = d.apps.filter((a) => a.status === "applied" && a.applied_at && toLocalDay(a.applied_at)! <= addDays(today, -7)).length;
  const upcoming = d.interviews.filter((i) => toLocalDay(i.starts_at)! >= today && toLocalDay(i.starts_at)! < addDays(today, 14)).length;
  if (deadlinesNext.length) focus.push({ key: "deadlines", vars: { n: deadlinesNext.length, first: `${deadlinesNext[0].title} — ${deadlinesNext[0].company}` } });
  if (upcoming) focus.push({ key: "prepInterviews", vars: { n: upcoming } });
  if (top.length) focus.push({ key: "applyTop", vars: { n: top.length, first: `${top[0].title} — ${top[0].company}`, score: top[0].score.toFixed(1) } });
  if (waiting) focus.push({ key: "followUp", vars: { n: waiting } });
  if (unevaluated) focus.push({ key: "evaluateBacklog", vars: { n: unevaluated } });
  if (!d.jobs.filter((j) => !j.archived).length || (newOffers === 0 && !top.length && !unevaluated)) focus.push({ key: "findOffers", vars: {} });
  if (!focus.length) focus.push({ key: "keepGoing", vars: { n: applied } });

  return { weekStart: ws, weekEnd: we, newOffers, evaluated, applied, responses, interviews, deadlinesNext, top, lessons, focus: focus.slice(0, 4) };
}
