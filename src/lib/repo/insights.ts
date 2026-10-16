// Data access + pure analytics for Today, Calendar, Insights and Skills.
// Pure helpers (dates, buckets, funnel math) are exported for tests; DB readers sit below them.
import { db, getProfile, kvGet, kvSet, listApplications, listJobs, type ApplicationWithJob, type JobWithMeta } from "@/lib/db";
import { computeSkillGaps } from "@/lib/ai";
import { detectField } from "@/lib/recommend/profile-model";
import { BENCHMARKS, calibrationBands, silentApps } from "@/lib/reports/digest";
import { cadenceFor } from "@/lib/repo/apps";
import { URGENCY_ORDER, type FollowupAngle, type Urgency } from "@/lib/apps/cadence";
import type { AppState, Evaluation, JobType, SkillGap } from "@/lib/types";

export { BENCHMARKS };

// ---------- dates ----------
const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** Parse the timestamp shapes found in the DB: SQLite UTC "YYYY-MM-DD HH:MM:SS", ISO with zone, local ISO, plain dates. */
export function parseTs(s: string | null | undefined): Date | null {
  if (!s) return null;
  let v = s.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v)) v = v.replace(" ", "T") + "Z"; // datetime('now') is UTC
  else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v += "T00:00"; // plain date = local midnight
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local calendar day "YYYY-MM-DD". */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Day of a stored value. Zone-less values are already local, so keep their written date. */
export function toDay(s: string | null | undefined): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(s.trim())) return s.trim().slice(0, 10);
  const d = parseTs(s);
  return d ? dayKey(d) : null;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY);
}

/** Monday 00:00 (local) of the week containing d. */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Index of the Monday-week a date falls in, counted back from `now` (0 = this week). */
function weeksAgo(d: Date, now: Date): number {
  return daysBetween(dayKey(weekStart(d)), dayKey(weekStart(now))) / 7;
}

/** Count dates per week for the last `weeks` weeks, oldest first, current week last. */
export function weeklyCounts(dates: (string | null | undefined)[], weeks: number, now = new Date()): number[] {
  const out = Array<number>(weeks).fill(0);
  for (const s of dates) {
    const d = parseTs(s);
    if (!d) continue;
    const ago = weeksAgo(d, now);
    if (ago >= 0 && ago < weeks) out[weeks - 1 - ago]++;
  }
  return out;
}

/** Average of values per week (0 when a week is empty), oldest first. */
export function weeklyAverages(points: { at: string | null; value: number }[], weeks: number, now = new Date()): number[] {
  const sum = Array<number>(weeks).fill(0);
  const n = Array<number>(weeks).fill(0);
  for (const p of points) {
    const d = parseTs(p.at);
    if (!d) continue;
    const ago = weeksAgo(d, now);
    if (ago >= 0 && ago < weeks) {
      sum[weeks - 1 - ago] += p.value;
      n[weeks - 1 - ago]++;
    }
  }
  return sum.map((s, i) => (n[i] ? Math.round((s / n[i]) * 10) / 10 : 0));
}

/** "YYYY-MM" from a query param, or the month of `now`. */
export function parseMonth(param: string | null | undefined, now = new Date()): string {
  const m = /^(\d{4})-(\d{2})$/.exec(param ?? "");
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 2000 && Number(m[1]) <= 2100) return param!;
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** 6×7 Monday-first grid of day keys covering the month. */
export function monthGrid(month: string): { key: string; inMonth: boolean }[] {
  const [y, m] = month.split("-").map(Number);
  const start = dayKey(weekStart(new Date(y, m - 1, 1)));
  return Array.from({ length: 42 }, (_, i) => {
    const key = addDays(start, i);
    return { key, inMonth: key.startsWith(month) };
  });
}

// ---------- funnel / conversion ----------
export const FORWARD: AppState[] = ["evaluated", "applied", "responded", "interview", "offer", "hired"];
const RESPONSE_STATES = new Set<string>(["responded", "interview", "offer", "hired", "rejected"]);

export interface AppHistory {
  status: AppState;
  applied_at: string | null;
  /** Status events, oldest first. */
  events: { status: string; at: string }[];
}

/** Furthest forward stage an application ever reached (index into FORWARD). Rejections keep their history. */
export function reachedStage(a: AppHistory): number {
  let best = Math.max(0, FORWARD.indexOf(a.status));
  for (const e of a.events) best = Math.max(best, FORWARD.indexOf(e.status as AppState));
  if (a.applied_at) best = Math.max(best, 1);
  return best;
}

export function funnelStats(apps: AppHistory[]): { stage: AppState; count: number; conv: number | null }[] {
  const reached = apps.map(reachedStage);
  return FORWARD.map((stage, i) => {
    const count = reached.filter((r) => r >= i).length;
    const prev = i === 0 ? null : reached.filter((r) => r >= i - 1).length;
    return { stage, count, conv: prev ? Math.round((count / prev) * 100) : null };
  });
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Response rate among applications that were sent, and median days until the first answer (incl. rejections). */
export function responseStats(apps: AppHistory[]): { applied: number; responded: number; rate: number | null; medianDays: number | null } {
  const sent = apps.filter((a) => reachedStage(a) >= 1);
  const delays: number[] = [];
  let responded = 0;
  for (const a of sent) {
    const appliedAt = parseTs(a.applied_at ?? a.events.find((e) => e.status === "applied")?.at);
    const first = a.events.find((e) => RESPONSE_STATES.has(e.status) && (!appliedAt || (parseTs(e.at)?.getTime() ?? 0) >= appliedAt.getTime() - 60_000)); // event stamps are second-precision
    if (first || RESPONSE_STATES.has(a.status)) responded++;
    const at = parseTs(first?.at);
    if (appliedAt && at) delays.push(Math.max(0, Math.round((at.getTime() - appliedAt.getTime()) / DAY)));
  }
  return { applied: sent.length, responded, rate: sent.length ? Math.round((responded / sent.length) * 100) : null, medianDays: median(delays) };
}

export function scoreBucket(g: number): "low" | "mid" | "high" {
  return g >= 4 ? "high" : g >= 3 ? "mid" : "low";
}

/** Histogram of 1–5 scores in 0.5 bins: [1,1.5) … [4.5,5]. */
export function scoreHistogram(scores: number[]): number[] {
  const bins = Array<number>(8).fill(0);
  for (const s of scores) bins[Math.min(7, Math.max(0, Math.floor((s - 1) * 2)))]++;
  return bins;
}

const isStrong = (e: Evaluation | null) => !!e && (e.verdict === "apply_now" || e.verdict === "apply" || e.global >= 3.5);

// ---------- calibration & patterns (pure) ----------
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}+#. ]/gu, " ").replace(/\s+/g, " ").trim();

/** Most frequent gaps and red flags across evaluations (one count per evaluation, folded text). */
export function blockerPatterns(evals: Pick<Evaluation, "gaps" | "flags">[], top = 8): { text: string; n: number; kind: "gap" | "flag" }[] {
  const count = new Map<string, { text: string; n: number; kind: "gap" | "flag" }>();
  for (const e of evals) {
    for (const kind of ["gap", "flag"] as const) {
      const seen = new Set<string>();
      for (const raw of kind === "gap" ? e.gaps : e.flags) {
        const key = `${kind}:${fold(raw).slice(0, 60)}`;
        if (!fold(raw) || seen.has(key)) continue;
        seen.add(key);
        const c = count.get(key);
        count.set(key, { text: c?.text ?? raw.trim(), n: (c?.n ?? 0) + 1, kind });
      }
    }
  }
  return [...count.values()].filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, top);
}

export interface OutcomeRow {
  key: string;
  applied: number;
  responded: number;
  interviews: number;
  responseRate: number | null;
  interviewRate: number | null;
}

/** Sent applications grouped by a key: response and interview rates (null under n=2). */
export function outcomesBy(hist: { key: string; h: AppHistory }[]): OutcomeRow[] {
  const m = new Map<string, AppHistory[]>();
  for (const x of hist) if (reachedStage(x.h) >= 1) m.set(x.key, [...(m.get(x.key) ?? []), x.h]);
  return [...m.entries()]
    .map(([key, hs]) => {
      const r = responseStats(hs);
      const interviews = hs.filter((h) => reachedStage(h) >= 3).length;
      return { key, applied: hs.length, responded: r.responded, interviews, responseRate: hs.length >= 2 ? r.rate : null, interviewRate: hs.length >= 2 ? Math.round((interviews / hs.length) * 100) : null };
    })
    .sort((a, b) => b.applied - a.applied);
}

/** Median days from the first interview event to the offer event. */
export function interviewToOfferDays(apps: AppHistory[]): number | null {
  const xs: number[] = [];
  for (const a of apps) {
    const iv = parseTs(a.events.find((e) => e.status === "interview")?.at);
    const of = parseTs(a.events.find((e) => e.status === "offer" || e.status === "hired")?.at);
    if (iv && of && of >= iv) xs.push(Math.round((of.getTime() - iv.getTime()) / DAY));
  }
  return median(xs);
}

// ---------- shared loaders ----------
type Row = Record<string, unknown>;

export interface InterviewItem { id: number; application_id: number; starts_at: string; kind: string; location: string; title: string; company: string }
export interface ReminderItem { id: number; application_id: number | null; job_id: number | null; title: string; due_at: string; done: boolean; job_title: string | null; company: string | null }

function statusEvents(): Map<number, { status: string; at: string }[]> {
  const rows = db().prepare("SELECT application_id, payload, created_at FROM events WHERE kind = 'status' ORDER BY created_at, id").all() as Row[];
  const m = new Map<number, { status: string; at: string }[]>();
  for (const r of rows) {
    const id = r.application_id as number;
    m.set(id, [...(m.get(id) ?? []), { status: r.payload as string, at: r.created_at as string }]);
  }
  return m;
}

export function listInterviews(): InterviewItem[] {
  return db()
    .prepare(
      `SELECT i.id, i.application_id, i.starts_at, i.kind, i.location, j.title, j.company
       FROM interviews i JOIN applications a ON a.id = i.application_id JOIN jobs j ON j.id = a.job_id
       ORDER BY i.starts_at`,
    )
    .all() as unknown as InterviewItem[];
}

export function listReminders(): ReminderItem[] {
  const rows = db()
    .prepare(
      `SELECT r.*, j.title AS job_title, j.company AS company
       FROM reminders r LEFT JOIN applications a ON a.id = r.application_id
       LEFT JOIN jobs j ON j.id = COALESCE(r.job_id, a.job_id)
       ORDER BY r.due_at`,
    )
    .all() as Row[];
  return rows.map((r) => ({
    id: r.id as number,
    application_id: (r.application_id as number) ?? null,
    job_id: (r.job_id as number) ?? null,
    title: r.title as string,
    due_at: r.due_at as string,
    done: !!r.done,
    job_title: (r.job_title as string) ?? null,
    company: (r.company as string) ?? null,
  }));
}

const history = (a: ApplicationWithJob, ev: Map<number, { status: string; at: string }[]>): AppHistory => ({
  status: a.status,
  applied_at: a.applied_at,
  events: ev.get(a.id) ?? [],
});

// ---------- reminders (write) ----------
export function addReminder(r: { title: string; due_at: string; job_id?: number | null; application_id?: number | null }): void {
  db()
    .prepare("INSERT INTO reminders (title, due_at, job_id, application_id) VALUES (?,?,?,?)")
    .run(r.title, r.due_at, r.job_id ?? null, r.application_id ?? null);
}

export function setReminderDone(id: number, done: boolean): void {
  db().prepare("UPDATE reminders SET done = ? WHERE id = ?").run(done ? 1 : 0, id);
}

// ---------- weekly goal ----------
const GOAL_KEY = "today:weekly_goal";
export const getWeeklyGoal = () => Math.min(30, Math.max(1, Math.round(Number(kvGet<number>(GOAL_KEY, 5)) || 5)));
export const setWeeklyGoal = (n: number) => kvSet(GOAL_KEY, n);

// ---------- Today ----------
export type FocusItem =
  | { kind: "reminder"; id: number; title: string; sub: string; day: string; overdue: boolean; href: string | null }
  | { kind: "interview"; id: number; title: string; sub: string; day: string; time: string; href: string }
  | { kind: "deadline"; jobId: number; title: string; sub: string; day: string; score: number; href: string }
  | { kind: "waiting"; appId: number; title: string; sub: string; days: number; href: string }
  | { kind: "cadence"; appId: number; title: string; company: string; urgency: Urgency; angle: FollowupAngle; days: number; followups: number; href: string }
  | { kind: "unevaluated"; count: number };

export function getToday(now = new Date()) {
  const today = dayKey(now);
  const tomorrow = addDays(today, 1);
  const jobs = listJobs();
  const apps = listApplications();
  const ev = statusEvents();
  const interviews = listInterviews();
  const reminders = listReminders().filter((r) => !r.done);

  const focus: FocusItem[] = [];
  for (const r of reminders) {
    const day = toDay(r.due_at);
    if (day && day <= today)
      focus.push({
        kind: "reminder",
        id: r.id,
        title: r.title,
        sub: [r.job_title, r.company].filter(Boolean).join(" · "),
        day,
        overdue: day < today,
        href: r.application_id ? `/app/pipeline/${r.application_id}` : r.job_id ? `/app/jobs/${r.job_id}` : null,
      });
  }
  for (const i of interviews) {
    const day = toDay(i.starts_at);
    if (day === today || day === tomorrow)
      focus.push({ kind: "interview", id: i.id, title: i.title, sub: i.company, day, time: i.starts_at.slice(11, 16), href: `/app/pipeline/${i.application_id}` });
  }
  for (const j of jobs) {
    const day = toDay(j.deadline);
    if (!j.application && day && day >= today && daysBetween(today, day) <= 3 && isStrong(j.evaluation))
      focus.push({ kind: "deadline", jobId: j.id, title: j.title, sub: j.company, day, score: j.evaluation!.global, href: `/app/jobs/${j.id}` });
  }
  // Follow-up cadence replaces the plain "waiting" rule: urgent replies, overdue follow-ups, cold applications.
  const cad = cadenceFor(apps.map((a) => ({ id: a.id, status: a.status, applied_at: a.applied_at, company: a.job.company })), now);
  for (const a of apps) {
    const c = cad.get(a.id);
    if (!c || c.urgency === "waiting" || c.urgency === "none") continue;
    const draft = c.urgency === "cold" ? "" : `&draft=${c.angle}`;
    focus.push({ kind: "cadence", appId: a.id, title: a.job.title, company: a.job.company, urgency: c.urgency, angle: c.angle, days: c.daysSince, followups: c.followupCount, href: `/app/pipeline/${a.id}?tab=messages${draft}` });
  }
  focus.sort((x, y) => (x.kind === "cadence" && y.kind === "cadence" ? URGENCY_ORDER[x.urgency] - URGENCY_ORDER[y.urgency] : 0));
  const unevaluated = jobs.filter((j) => !j.evaluation).length;
  if (unevaluated) focus.push({ kind: "unevaluated", count: unevaluated });

  // KPIs over the last 8 weeks
  const W = 8;
  const evals = jobs.filter((j) => j.evaluation).map((j) => j.evaluation!);
  const kpis = {
    offers: weeklyCounts(jobs.map((j) => j.created_at), W, now),
    evaluated: weeklyCounts(evals.map((e) => e.created_at), W, now),
    applied: weeklyCounts(apps.map((a) => a.applied_at), W, now),
    interviews: weeklyCounts(interviews.map((i) => i.starts_at), W, now),
    fit: weeklyAverages(evals.map((e) => ({ at: e.created_at, value: e.global })), W, now),
    avgFit: evals.length ? evals.reduce((s, e) => s + e.global, 0) / evals.length : null,
  };

  const topMatches = jobs
    .filter((j) => j.evaluation && !j.application)
    .sort((a, b) => b.evaluation!.global - a.evaluation!.global)
    .slice(0, 4);

  const reached = apps.map((a) => reachedStage(history(a, ev)));
  const pipeline = FORWARD.map((stage) => ({ stage, n: apps.filter((a) => a.status === stage).length }));
  const closed = apps.filter((a) => a.status === "rejected" || a.status === "discarded").length;

  const upcoming = [
    ...interviews
      .filter((i) => (toDay(i.starts_at) ?? "") >= today)
      .map((i) => ({ key: `i${i.id}`, kind: "interview" as const, day: toDay(i.starts_at)!, time: i.starts_at.slice(11, 16), title: i.title, sub: i.company, href: `/app/pipeline/${i.application_id}` })),
    ...reminders
      .filter((r) => (toDay(r.due_at) ?? "") > today)
      .map((r) => ({ key: `r${r.id}`, kind: "reminder" as const, day: toDay(r.due_at)!, time: r.due_at.length > 10 ? r.due_at.slice(11, 16) : "", title: r.title, sub: [r.job_title, r.company].filter(Boolean).join(" · "), href: "/app/calendar?month=" + toDay(r.due_at)!.slice(0, 7) })),
  ]
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time))
    .slice(0, 5);

  // Weekly goal + streak of consecutive weeks meeting it (this week counts once reached)
  const goal = getWeeklyGoal();
  const perWeek = weeklyCounts(apps.map((a) => a.applied_at), 52, now);
  const thisWeek = perWeek[51];
  let streak = thisWeek >= goal ? 1 : 0;
  for (let i = 50; i >= 0 && perWeek[i] >= goal; i--) streak++;

  const profile = getProfile();
  return {
    today,
    focus,
    kpis,
    topMatches,
    pipeline,
    closed,
    everApplied: reached.filter((r) => r >= 1).length,
    upcoming,
    goal: { target: goal, done: thisWeek, streak },
    setup: {
      profile: profile.cv_md.trim().length >= 50 && profile.skills.length > 0,
      offers: jobs.length > 0,
      evaluated: evals.length > 0,
      tracked: apps.length > 0,
    },
    name: profile.name,
  };
}

// ---------- Calendar ----------
export type CalKind = "interview" | "reminder" | "deadline" | "applied";
export interface CalItem {
  id: string;
  kind: CalKind;
  day: string;
  time: string;
  title: string;
  sub: string;
  href: string;
  reminderId?: number;
  done?: boolean;
}

export function getCalendar(month: string) {
  const grid = monthGrid(month);
  const from = grid[0].key;
  const to = grid[grid.length - 1].key;
  const inRange = (d: string | null): d is string => !!d && d >= from && d <= to;
  const items: CalItem[] = [];

  for (const i of listInterviews()) {
    const day = toDay(i.starts_at);
    if (inRange(day)) items.push({ id: `i${i.id}`, kind: "interview", day, time: i.starts_at.slice(11, 16), title: i.title, sub: i.company, href: `/app/pipeline/${i.application_id}` });
  }
  for (const r of listReminders()) {
    const day = toDay(r.due_at);
    if (inRange(day))
      items.push({
        id: `r${r.id}`,
        kind: "reminder",
        day,
        time: r.due_at.length > 10 ? r.due_at.slice(11, 16) : "",
        title: r.title,
        sub: [r.job_title, r.company].filter(Boolean).join(" · "),
        href: r.application_id ? `/app/pipeline/${r.application_id}` : r.job_id ? `/app/jobs/${r.job_id}` : "",
        reminderId: r.id,
        done: r.done,
      });
  }
  for (const j of listJobs()) {
    const day = toDay(j.deadline);
    const tracked = j.application && !["rejected", "discarded", "hired"].includes(j.application.status);
    if (inRange(day) && (tracked || (!j.application && isStrong(j.evaluation))))
      items.push({ id: `d${j.id}`, kind: "deadline", day, time: "", title: j.title, sub: j.company, href: j.application ? `/app/pipeline/${j.application.id}` : `/app/jobs/${j.id}` });
  }
  for (const a of listApplications()) {
    const day = toDay(a.applied_at);
    if (inRange(day)) items.push({ id: `a${a.id}`, kind: "applied", day, time: "", title: a.job.title, sub: a.job.company, href: `/app/pipeline/${a.id}` });
  }
  items.sort((a, b) => (a.day + (a.time || "99")).localeCompare(b.day + (b.time || "99")));
  return { grid, items };
}

/** Offers that a reminder can be attached to (tracked or strong). */
export function reminderTargets(): { id: number; label: string }[] {
  return listJobs()
    .filter((j) => j.application || isStrong(j.evaluation))
    .slice(0, 80)
    .map((j) => ({ id: j.id, label: `${j.title} · ${j.company}` }));
}

// ---------- Insights ----------
export type Takeaway = { key: "typeRate" | "scoreConverts" | "scoreFlat" | "missingSkill" | "medianReply" | "momentum" | "untracked" | "needData"; vars: Record<string, string | number> };

export function getInsights(rangeDays: number | null, now = new Date()) {
  const cutoff = rangeDays ? now.getTime() - rangeDays * DAY : -Infinity;
  const within = (s: string | null) => (parseTs(s)?.getTime() ?? 0) >= cutoff;
  const jobs: JobWithMeta[] = listJobs().filter((j) => within(j.created_at));
  const allApps = listApplications();
  const apps = allApps.filter((a) => within(a.created_at));
  const ev = statusEvents();
  const hist = apps.map((a) => ({ a, h: history(a, ev) }));

  const funnel = funnelStats(hist.map((x) => x.h));
  const response = responseStats(hist.map((x) => x.h));
  const perWeek = weeklyCounts(allApps.map((a) => a.applied_at), 12, now);
  const weekLabels = Array.from({ length: 12 }, (_, i) => dayKey(weekStart(new Date(now.getTime() - (11 - i) * 7 * DAY))));

  const evaluated = jobs.filter((j) => j.evaluation);
  const histogram = scoreHistogram(evaluated.map((j) => j.evaluation!.global));
  const avgBy = <K extends string>(key: (j: JobWithMeta) => K) => {
    const m = new Map<K, number[]>();
    for (const j of evaluated) m.set(key(j), [...(m.get(key(j)) ?? []), j.evaluation!.global]);
    return [...m.entries()]
      .map(([k, xs]) => ({ key: k, avg: Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10, n: xs.length }))
      .sort((a, b) => b.avg - a.avg);
  };
  const bySource = avgBy((j) => j.source);
  const byType = avgBy((j) => j.type);
  const verdicts = (["apply_now", "apply", "maybe", "skip"] as const).map((v) => ({ verdict: v, n: evaluated.filter((j) => j.evaluation!.verdict === v).length }));
  const skills: SkillGap[] = computeSkillGaps(jobs, getProfile()).slice(0, 12);

  const buckets = (["low", "mid", "high"] as const).map((b) => {
    const xs = hist.filter((x) => x.a.evaluation && scoreBucket(x.a.evaluation.global) === b && reachedStage(x.h) >= 1);
    const interviews = xs.filter((x) => reachedStage(x.h) >= 3).length;
    const r = responseStats(xs.map((x) => x.h));
    return { bucket: b, applied: xs.length, interviews, rate: xs.length ? Math.round((interviews / xs.length) * 100) : null, responseRate: r.rate };
  });

  const typeRates = new Map<JobType, AppHistory[]>();
  for (const x of hist) typeRates.set(x.a.job.type, [...(typeRates.get(x.a.job.type) ?? []), x.h]);
  const typeStats = [...typeRates.entries()].map(([type, hs]) => ({ type, ...responseStats(hs) })).filter((s) => s.applied >= 2 && s.rate !== null);

  // Plain-language takeaways (heuristic; only when the numbers support them)
  const takeaways: Takeaway[] = [];
  if (typeStats.length >= 2) {
    const sorted = [...typeStats].sort((a, b) => b.rate! - a.rate!);
    const [best, worst] = [sorted[0], sorted[sorted.length - 1]];
    if (best.rate! > 0 && (worst.rate === 0 || best.rate! / worst.rate! >= 1.5))
      takeaways.push({ key: "typeRate", vars: { a: best.type, b: worst.type, x: worst.rate ? (best.rate! / worst.rate!).toFixed(1) : "∞", ra: best.rate!, rb: worst.rate! } });
  }
  const hi = buckets[2];
  const lo = { applied: buckets[0].applied + buckets[1].applied, interviews: buckets[0].interviews + buckets[1].interviews };
  if (hi.applied >= 2 && lo.applied >= 2) {
    const loRate = Math.round((lo.interviews / lo.applied) * 100);
    takeaways.push(hi.rate! > loRate ? { key: "scoreConverts", vars: { hi: hi.rate!, lo: loRate } } : { key: "scoreFlat", vars: { hi: hi.rate!, lo: loRate } });
  }
  const missing = skills.find((s) => !s.have);
  if (missing && missing.demand >= 2) takeaways.push({ key: "missingSkill", vars: { skill: missing.skill, n: missing.demand } });
  if (response.medianDays !== null) takeaways.push({ key: "medianReply", vars: { d: response.medianDays, f: Math.max(5, Math.ceil(response.medianDays) + 3) } });
  const last4 = perWeek.slice(8).reduce((s, x) => s + x, 0);
  const prev4 = perWeek.slice(4, 8).reduce((s, x) => s + x, 0);
  if (last4 + prev4 > 0 && last4 !== prev4) takeaways.push({ key: "momentum", vars: { a: last4, b: prev4 } });
  const untracked = evaluated.filter((j) => !j.application && (j.evaluation!.verdict === "apply_now" || j.evaluation!.verdict === "apply")).length;
  if (untracked >= 2) takeaways.push({ key: "untracked", vars: { n: untracked } });
  if (!takeaways.length) takeaways.push({ key: "needData", vars: {} });

  // Calibration, patterns, benchmarks: over every sent application (not range-limited, n is small enough already).
  const allHist = allApps.map((a) => ({ a, h: history(a, ev) }));
  const calibration = calibrationBands(
    allHist.map((x) => ({ score: x.a.evaluation?.global ?? null, sent: reachedStage(x.h) >= 1, interviewed: reachedStage(x.h) >= 3, offered: reachedStage(x.h) >= 4 })),
  );
  const blockers = blockerPatterns(jobs.filter((j) => j.evaluation).map((j) => j.evaluation!));
  const bySourceOutcome = outcomesBy(allHist.map((x) => ({ key: x.a.job.source, h: x.h })));
  const byFieldOutcome = outcomesBy(allHist.map((x) => ({ key: detectField(`${x.a.job.title}\n${x.a.job.description}`)?.field ?? "other", h: x.h })));
  const allResponse = responseStats(allHist.map((x) => x.h));
  const sentAll = allHist.filter((x) => reachedStage(x.h) >= 1);
  const you = {
    responseRate: allResponse.rate,
    interviewRate: sentAll.length ? Math.round((sentAll.filter((x) => reachedStage(x.h) >= 3).length / sentAll.length) * 100) : null,
    firstResponseDays: allResponse.medianDays,
    interviewToOfferDays: interviewToOfferDays(allHist.map((x) => x.h)),
    n: sentAll.length,
  };
  const silent = silentApps(
    allApps.map((a) => ({ id: a.id, status: a.status, applied_at: a.applied_at, job: { id: a.job.id, title: a.job.title, company: a.job.company, deadline: a.job.deadline, created_at: a.job.created_at, archived: a.job.archived } })),
    [...ev.entries()].flatMap(([id, es]) => es.map((e) => ({ application_id: id, payload: e.status, created_at: e.at }))),
    dayKey(now),
  ).slice(0, 8);

  return {
    funnel, response, perWeek, weekLabels, histogram, bySource, byType, verdicts, skills, buckets, takeaways,
    calibration, blockers, bySourceOutcome, byFieldOutcome, you, silent,
    totals: { jobs: jobs.length, evaluated: evaluated.length, apps: apps.length },
  };
}

// ---------- Skills (upskill) ----------
const PROGRESS_KEY = "upskill:progress";
type Progress = Record<string, number[]>;

export function getUpskillProgress(): Progress {
  return kvGet<Progress>(PROGRESS_KEY, {});
}

export function setStepDone(skill: string, step: number, done: boolean): void {
  const p = getUpskillProgress();
  const k = skill.toLowerCase();
  const set = new Set(p[k] ?? []);
  if (done) set.add(step);
  else set.delete(step);
  p[k] = [...set].sort((a, b) => a - b);
  kvSet(PROGRESS_KEY, p);
}

export function markAllSteps(skill: string, steps: number): void {
  const p = getUpskillProgress();
  p[skill.toLowerCase()] = Array.from({ length: steps }, (_, i) => i);
  kvSet(PROGRESS_KEY, p);
}

/** Skill demand per offer type, for the heatmap. */
export function skillMatrix(jobs: JobWithMeta[]) {
  const profile = getProfile();
  const all = computeSkillGaps(jobs, profile).slice(0, 40);
  const types = [...new Set(jobs.map((j) => j.type))] as JobType[];
  const perType = new Map(types.map((ty) => [ty, new Map(computeSkillGaps(jobs.filter((j) => j.type === ty), profile).map((g) => [g.skill, g.demand]))]));
  return {
    types,
    rows: all.map((g) => ({ skill: g.skill, have: g.have, total: g.demand, byType: Object.fromEntries(types.map((ty) => [ty, perType.get(ty)!.get(g.skill) ?? 0])) as Record<string, number> })),
  };
}
