// Follow-up cadence: pure, testable. Mirrors career-ops followup-cadence.mjs.
// applied → first follow-up +7 d, then +7 d, max 2 (or 60 days of silence) then COLD;
// responded → +1 d (urgent reply window) then +3 d; interview → thank-you +1 d then +3 d.
import type { AppState } from "../types";

export const DEFAULT_CADENCE = {
  applied_first: 7,
  applied_subsequent: 7,
  applied_max_followups: 2,
  /** Days after applying with no answer before the application counts as cold, follow-ups or not. */
  applied_stale: 60,
  responded_initial: 1,
  responded_subsequent: 3,
  interview_thankyou: 1,
  /** Days of post-interview silence before the courtesy flag. */
  rejection_latency: 30,
} as const;

export type Urgency = "urgent" | "overdue" | "waiting" | "cold" | "none";
export const URGENCY_ORDER: Record<Urgency, number> = { urgent: 0, overdue: 1, waiting: 2, cold: 3, none: 4 };

/** Which draft the next touch should be. */
export type FollowupAngle = "first" | "second" | "thankyou" | "reply" | "noshow" | "none";
export type DraftVariant = Exclude<FollowupAngle, "none">;
export const DRAFT_VARIANTS: DraftVariant[] = ["first", "second", "thankyou", "reply", "noshow"];
export const isDraftVariant = (s: unknown): s is DraftVariant => typeof s === "string" && (DRAFT_VARIANTS as string[]).includes(s);

export interface CadenceInput {
  status: AppState;
  /** ISO timestamp or date. */
  applied_at: string | null;
  /** When the current stage was entered (status event), ISO. */
  stageEnteredAt: string | null;
  /** Timestamps of follow-ups sent (events kind=followup), any order. */
  followups: string[];
  /** Most recent past interview start, ISO local datetime, if any. */
  lastInterviewAt?: string | null;
  /** Median days this company took to answer previous applications, if known. */
  companyLatencyDays?: number | null;
}

export interface Cadence {
  urgency: Urgency;
  angle: FollowupAngle;
  /** Follow-ups sent while in the current stage. */
  followupCount: number;
  /** Days since the clock started (application, stage entry or last follow-up). */
  daysSince: number;
  /** Next due date YYYY-MM-DD, null when cold or not applicable. */
  nextDue: string | null;
  /** Days of silence after the last interview, when ≥ rejection_latency. */
  silentDays: number | null;
  companyLatencyDays: number | null;
}

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Parse DB timestamp shapes: SQLite UTC "YYYY-MM-DD HH:MM:SS", ISO, local datetime, plain date. */
export function parseTs(s: string | null | undefined): Date | null {
  if (!s) return null;
  let v = s.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v)) v = v.replace(" ", "T") + "Z";
  else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v += "T00:00";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);
const plusDays = (d: Date, n: number) => localDate(new Date(d.getTime() + n * DAY));

const ACTIONABLE: AppState[] = ["applied", "responded", "interview"];

export function computeCadence(input: CadenceInput, now: Date, cfg = DEFAULT_CADENCE): Cadence {
  const none: Cadence = { urgency: "none", angle: "none", followupCount: 0, daysSince: 0, nextDue: null, silentDays: null, companyLatencyDays: input.companyLatencyDays ?? null };
  if (!ACTIONABLE.includes(input.status)) return none;

  const entered = parseTs(input.stageEnteredAt);
  const start = input.status === "applied" ? (parseTs(input.applied_at) ?? entered) : (entered ?? parseTs(input.applied_at));
  if (!start) return none;

  // Only follow-ups sent after the stage started count for this stage.
  const sent = input.followups
    .map(parseTs)
    .filter((d): d is Date => !!d && d.getTime() >= start.getTime() - 60_000)
    .sort((a, b) => a.getTime() - b.getTime());
  const last = sent[sent.length - 1] ?? null;
  const n = sent.length;
  const daysSinceStart = Math.max(0, daysBetween(start, now));
  const daysSinceLast = last ? Math.max(0, daysBetween(last, now)) : null;

  let urgency: Urgency;
  let angle: FollowupAngle;
  let nextDue: string | null;

  if (input.status === "applied") {
    if (n >= cfg.applied_max_followups || daysSinceStart >= cfg.applied_stale) {
      urgency = "cold";
      angle = "none";
      nextDue = null;
    } else {
      nextDue = last ? plusDays(last, cfg.applied_subsequent) : plusDays(start, cfg.applied_first);
      const due = n === 0 ? daysSinceStart >= cfg.applied_first : daysSinceLast! >= cfg.applied_subsequent;
      urgency = due ? "overdue" : "waiting";
      angle = n === 0 ? "first" : "second";
    }
  } else if (input.status === "responded") {
    angle = "reply";
    if (last) {
      nextDue = plusDays(last, cfg.responded_subsequent);
      urgency = daysSinceLast! >= cfg.responded_subsequent ? "overdue" : "waiting";
    } else {
      urgency = daysSinceStart < cfg.responded_initial ? "urgent" : daysSinceStart >= cfg.responded_subsequent ? "overdue" : "waiting";
      // Days 1-2: the 24 h window has passed, so the next date shown is the reminder, never yesterday.
      nextDue = plusDays(start, urgency === "waiting" ? cfg.responded_subsequent : cfg.responded_initial);
    }
  } else {
    // interview: thank-you within a day of the interview, then every 3 days. With no interview date yet
    // (the "plan the interview" dialog was skipped), nothing is due: there is nothing to thank them for.
    const iv = parseTs(input.lastInterviewAt) ?? null;
    if (!iv && !last) return none;
    const anchor = iv && iv.getTime() <= now.getTime() ? iv : start;
    if (iv && iv.getTime() > now.getTime()) {
      nextDue = plusDays(iv, cfg.interview_thankyou);
      urgency = "waiting";
      angle = "thankyou";
    } else if (last && last.getTime() >= anchor.getTime()) {
      nextDue = plusDays(last, cfg.responded_subsequent);
      urgency = daysSinceLast! >= cfg.responded_subsequent ? "overdue" : "waiting";
      angle = "reply";
    } else {
      nextDue = plusDays(anchor, cfg.interview_thankyou);
      urgency = daysBetween(anchor, now) >= cfg.interview_thankyou ? "overdue" : "waiting";
      angle = "thankyou";
    }
  }

  let silentDays: number | null = null;
  if (input.status === "interview") {
    const iv = parseTs(input.lastInterviewAt);
    if (iv && iv.getTime() <= now.getTime()) {
      const d = daysBetween(iv, now);
      if (d >= cfg.rejection_latency) silentDays = d;
    }
  }

  return {
    urgency,
    angle,
    followupCount: n,
    daysSince: daysSinceLast ?? daysSinceStart,
    nextDue,
    silentDays,
    companyLatencyDays: input.companyLatencyDays ?? null,
  };
}

/** Sort key: URGENT > OVERDUE > waiting > COLD, then most days waiting first. */
export const byUrgency = <T extends { cadence: Cadence }>(a: T, b: T) =>
  URGENCY_ORDER[a.cadence.urgency] - URGENCY_ORDER[b.cadence.urgency] || b.cadence.daysSince - a.cadence.daysSince;

/** Median of days between application and first response, per company (case-insensitive). */
export function companyLatency(rows: { company: string; applied_at: string | null; firstResponseAt: string | null }[]): Map<string, number> {
  const by = new Map<string, number[]>();
  for (const r of rows) {
    const a = parseTs(r.applied_at);
    const b = parseTs(r.firstResponseAt);
    if (!a || !b || b < a) continue;
    const k = r.company.trim().toLowerCase();
    by.set(k, [...(by.get(k) ?? []), daysBetween(a, b)]);
  }
  const out = new Map<string, number>();
  for (const [k, xs] of by) {
    const s = xs.sort((x, y) => x - y);
    out.set(k, s.length % 2 ? s[s.length >> 1] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2));
  }
  return out;
}

// ---------- writing rules for generated follow-ups ----------
export const MAX_FOLLOWUP_WORDS = 150;

/** Openers career-ops bans (EN + FR). Matched at the start of a sentence. */
export const BANNED_OPENERS = [
  /\bjust (checking|following|touching|circling)\b/i,
  /\btouching base\b/i,
  /\bcircling back\b/i,
  /\bjust following up\b/i,
  /\bjust checking in\b/i,
  /\bpetit rappel\b/i,
  /\bje me permets de vous relancer\b/i,
  /\bsans nouvelles? de votre part\b/i,
];

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Problems with a follow-up draft: banned opener, over the word cap. */
export function checkFollowup(body: string, maxWords = MAX_FOLLOWUP_WORDS): ("banned_opener" | "too_long")[] {
  const out: ("banned_opener" | "too_long")[] = [];
  if (BANNED_OPENERS.some((re) => re.test(body))) out.push("banned_opener");
  if (wordCount(body) > maxWords) out.push("too_long");
  return out;
}
