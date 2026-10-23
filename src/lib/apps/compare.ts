// Multi-offer comparison (career-ops modes/ofertas.md): 10 dimensions scored 1–5 from data
// already in the app, weighted total. Pure so the client can recompute as weights change.
import type { AppState, Evaluation, Job, JobType } from "../types";
import { TND_PER, extractSalaryMentions } from "../salaries";

export const COMPARE_DIMS = ["fit", "salary", "location", "type", "company", "growth", "speed", "flags", "rating", "deadline"] as const;
export type CompareDim = (typeof COMPARE_DIMS)[number];
/** Default weights (sum 100), after career-ops modes/ofertas.md. */
export const DEFAULT_WEIGHTS: Record<CompareDim, number> = { fit: 25, salary: 10, location: 10, type: 10, company: 10, growth: 10, speed: 5, flags: 10, rating: 5, deadline: 5 };

export type DimScores = Record<CompareDim, number>;

export interface CompareInput {
  job: Pick<Job, "title" | "description" | "location" | "remote" | "type" | "deadline">;
  evaluation: Pick<Evaluation, "global" | "growth" | "red_flags"> | null;
  status: AppState;
  applied_at: string | null;
  companyRating: number;
  personalRating: number;
  targetLocations: string[];
  targetTypes: JobType[];
  today: string;
}

const clamp = (n: number) => Math.round(Math.min(5, Math.max(1, n)) * 10) / 10;
const DAY = 86_400_000;

/** Monthly TND equivalent of the first salary mention, or null. Indicative only. */
export function monthlyTnd(description: string): number | null {
  const m = extractSalaryMentions(description)[0];
  if (!m) return null;
  const mid = (m.min + m.max) / 2;
  // ponytail: an hourly rate is taken as full time (35 h a week).
  const monthly = m.period === "year" ? mid / 12 : m.period === "hour" ? (mid * 35 * 52) / 12 : mid;
  return Math.round(monthly * TND_PER[m.currency]);
}

export function scoreDims(i: CompareInput): { scores: DimScores; salary: number | null; daysLeft: number | null } {
  const salary = monthlyTnd(i.job.description);
  const loc = i.job.location.toLowerCase();
  const locHit = i.targetLocations.some((l) => l && loc.includes(l.toLowerCase()));
  const daysLeft = i.job.deadline ? Math.round((new Date(`${i.job.deadline.slice(0, 10)}T00:00`).getTime() - new Date(`${i.today}T00:00`).getTime()) / DAY) : null;
  const applied = i.applied_at ? Math.floor((new Date(`${i.today}T00:00`).getTime() - new Date(i.applied_at).getTime()) / DAY) : null;
  const speed = ["offer", "hired"].includes(i.status) ? 5 : ["responded", "interview"].includes(i.status) ? 4 : i.status === "applied" ? (applied !== null && applied > 21 ? 1 : applied !== null && applied > 7 ? 2 : 3) : 3;
  const scores: DimScores = {
    fit: clamp(i.evaluation?.global ?? 3),
    salary: salary === null ? 3 : salary >= 1500 ? 5 : salary >= 1000 ? 4 : salary >= 600 ? 3 : salary >= 300 ? 2 : 1,
    location: i.job.remote ? 5 : locHit ? 4 : !loc ? 3 : 2,
    type: i.targetTypes.includes(i.job.type) ? 5 : 2,
    company: i.companyRating || 3,
    growth: clamp(i.evaluation?.growth ?? 3),
    speed,
    flags: clamp(i.evaluation?.red_flags ?? 3),
    rating: i.personalRating || 3,
    deadline: daysLeft === null ? 3 : daysLeft < 0 ? 1 : daysLeft < 3 ? 2 : daysLeft < 7 ? 3 : daysLeft < 14 ? 4 : 5,
  };
  return { scores, salary, daysLeft };
}

export function weightedTotal(scores: DimScores, weights: Record<CompareDim, number>): number {
  let sum = 0;
  let w = 0;
  for (const d of COMPARE_DIMS) {
    sum += scores[d] * weights[d];
    w += weights[d];
  }
  return w ? Math.round((sum / w) * 100) / 100 : 0;
}
