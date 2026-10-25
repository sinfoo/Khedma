// Weekly digest: pure week math and bucketing over plain rows, so it can be
// unit-tested without a database. Weeks start on Monday (local time).
import type { AppState } from "../types";
import { parseTs } from "../apps/cadence";

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

/**
 * Local YYYY-MM-DD for a stored timestamp, or the date part of a date-only string. SQLite's "YYYY-MM-DD HH:MM:SS"
 * is UTC (read through parseTs, not as local time), so an evening event no longer lands on the next day.
 */
export function toLocalDay(s: string | null | undefined): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = parseTs(s);
  return d ? localDate(d) : s.slice(0, 10);
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

// ---------- calibration (career-ops calibrate.mjs) ----------
export const SCORE_BANDS = ["4.5+", "4.0-4.4", "3.5-3.9", "<3.5"] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number];
export const scoreBand = (g: number): ScoreBand => (g >= 4.5 ? "4.5+" : g >= 4 ? "4.0-4.4" : g >= 3.5 ? "3.5-3.9" : "<3.5");

export type CalibrationVerdict = "separating" | "flat" | "inverted" | "insufficient";
export interface CalibrationBand {
  band: ScoreBand;
  n: number;
  interviews: number;
  offers: number;
  /** Percent, null when n < 2. */
  interviewRate: number | null;
  offerRate: number | null;
}
/**
 * How each kind of role actually went, for the evaluation prompt. Empty below `min` closed applications;
 * a kind needs 2 closed applications to be listed. good = reached an interview or better.
 */
export function outcomeNote(rows: { kind: string; good: boolean }[], min = 3): string {
  if (rows.length < min) return "";
  const by = new Map<string, { n: number; good: number }>();
  for (const r of rows) {
    const g = by.get(r.kind) ?? { n: 0, good: 0 };
    g.n++;
    if (r.good) g.good++;
    by.set(r.kind, g);
  }
  return [...by]
    .filter(([, g]) => g.n >= 2)
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([k, g]) => `- ${k}: ${g.good} of ${g.n} closed applications reached an interview or better`)
    .join("\n");
}

/** Minimum sent applications before a verdict is more than an anecdote. */
export const CALIBRATION_MIN_N = 5;

/**
 * Score band × interview % × offer % over sent applications. Advisory only: it never changes scoring.
 * separating = higher bands convert better; inverted = lower bands convert better; flat = no difference.
 */
export function calibrationBands(rows: { score: number | null; sent: boolean; interviewed: boolean; offered: boolean }[]): { bands: CalibrationBand[]; verdict: CalibrationVerdict; n: number } {
  const sent = rows.filter((r) => r.sent && r.score !== null);
  const bands = SCORE_BANDS.map((band) => {
    const xs = sent.filter((r) => scoreBand(r.score!) === band);
    const interviews = xs.filter((r) => r.interviewed).length;
    const offers = xs.filter((r) => r.offered).length;
    const pct = (k: number) => (xs.length >= 2 ? Math.round((k / xs.length) * 100) : null);
    return { band, n: xs.length, interviews, offers, interviewRate: pct(interviews), offerRate: pct(offers) };
  });
  const rated = bands.filter((b) => b.interviewRate !== null);
  let verdict: CalibrationVerdict = "insufficient";
  if (sent.length >= CALIBRATION_MIN_N && rated.length >= 2) {
    const hi = rated[0].interviewRate!;
    const lo = rated[rated.length - 1].interviewRate!;
    verdict = hi - lo >= 10 ? "separating" : lo - hi >= 10 ? "inverted" : "flat";
  }
  return { bands, verdict, n: sent.length };
}

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
  /** Companies that have not answered a sent application for 14+ days, longest silence first. */
  silent: { application_id: number; title: string; company: string; days: number }[];
  /** Score-band calibration over every sent application (not just this week). */
  calibration: ReturnType<typeof calibrationBands>;
  /** Response rate over all sent applications, next to the directional benchmark. */
  responseRate: number | null;
}

/** Directional candidate-side benchmarks (career-ops templates/benchmarks.yml). Percent / days. */
export const BENCHMARKS = {
  responseRate: [2, 13] as const,
  appToInterview: [2, 4] as const,
  firstResponseDays: [5, 14] as const,
  interviewToOfferDays: [20, 28] as const,
  year: 2026,
};

const RESPONSE: AppState[] = ["responded", "interview", "offer", "hired", "rejected"];
export const SILENT_DAYS = 14;

const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00`).getTime() - new Date(`${a}T00:00`).getTime()) / 86_400_000);

/** Sent applications still in "applied" with no response event, by days of silence. */
export function silentApps(apps: Pick<DigestApp, "id" | "status" | "applied_at" | "job">[], statusEvents: DigestInput["statusEvents"], today: string, minDays = SILENT_DAYS) {
  const answered = new Set(statusEvents.filter((e) => RESPONSE.includes(e.payload as AppState)).map((e) => e.application_id));
  return apps
    .filter((a) => a.status === "applied" && a.applied_at && !answered.has(a.id))
    .map((a) => ({ application_id: a.id, title: a.job.title, company: a.job.company, days: daysBetween(toLocalDay(a.applied_at)!, today) }))
    .filter((x) => x.days >= minDays)
    .sort((a, b) => b.days - a.days);
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
  const latest = new Map<number, number>();
  for (const e of d.evaluations) latest.set(e.job_id, e.global); // sorted ascending by caller: last wins
  // Priority #1 is often a deadline: only offers you track, or untracked ones that scored well, qualify.
  const deadlinesNext = d.jobs
    .filter((j) => !j.archived && inWeek(j.deadline, nextStart))
    .filter((j) => {
      const a = appByJob.get(j.id);
      return a ? OPEN.includes(a.status) : (latest.get(j.id) ?? 0) >= GOOD_SCORE;
    })
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))
    .map((j) => ({ application_id: appByJob.get(j.id)?.id ?? null, job_id: j.id, title: j.title, company: j.company, deadline: j.deadline! }));

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
  const unevaluated = d.jobs.filter((j) => !j.archived && !latest.has(j.id) && (!j.deadline || j.deadline >= today)).length;
  const waiting = d.apps.filter((a) => a.status === "applied" && a.applied_at && toLocalDay(a.applied_at)! <= addDays(today, -7)).length;
  const upcoming = d.interviews.filter((i) => toLocalDay(i.starts_at)! >= today && toLocalDay(i.starts_at)! < addDays(today, 14)).length;
  if (deadlinesNext.length) focus.push({ key: "deadlines", vars: { n: deadlinesNext.length, first: `${deadlinesNext[0].title} — ${deadlinesNext[0].company}` } });
  if (upcoming) focus.push({ key: "prepInterviews", vars: { n: upcoming } });
  if (top.length) focus.push({ key: "applyTop", vars: { n: top.length, first: `${top[0].title} — ${top[0].company}`, score: top[0].score.toFixed(1) } });
  if (waiting) focus.push({ key: "followUp", vars: { n: waiting } });
  if (unevaluated) focus.push({ key: "evaluateBacklog", vars: { n: unevaluated } });
  if (!d.jobs.filter((j) => !j.archived).length || (newOffers === 0 && !top.length && !unevaluated)) focus.push({ key: "findOffers", vars: {} });
  if (!focus.length) focus.push({ key: "keepGoing", vars: { n: applied } });

  const reached = new Map<number, Set<string>>();
  for (const e of d.statusEvents) reached.set(e.application_id, (reached.get(e.application_id) ?? new Set()).add(e.payload));
  const sentApps = d.apps.filter((a) => a.applied_at || PAST.includes(a.status));
  const calibration = calibrationBands(
    sentApps.map((a) => {
      const r = reached.get(a.id) ?? new Set<string>();
      return {
        score: a.score,
        sent: true,
        interviewed: r.has("interview") || r.has("offer") || r.has("hired") || ["interview", "offer", "hired"].includes(a.status),
        offered: r.has("offer") || r.has("hired") || ["offer", "hired"].includes(a.status),
      };
    }),
  );
  const respondedAll = sentApps.filter((a) => [...(reached.get(a.id) ?? [])].some((s) => RESPONSE.includes(s as AppState)) || RESPONSE.includes(a.status)).length;
  const responseRate = sentApps.length ? Math.round((respondedAll / sentApps.length) * 100) : null;

  return {
    weekStart: ws,
    weekEnd: we,
    newOffers,
    evaluated,
    applied,
    responses,
    interviews,
    deadlinesNext,
    top,
    lessons,
    focus: focus.slice(0, 4),
    silent: silentApps(d.apps, d.statusEvents, today).slice(0, 5),
    calibration,
    responseRate,
  };
}
const PAST: AppState[] = ["applied", "responded", "interview", "offer", "hired"];
/** An untracked offer this good is worth a deadline reminder in the weekly priorities. */
const GOOD_SCORE = 3.5;
