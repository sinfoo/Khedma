// Client-safe constants and types for the apply area (no DB imports here).

export const CHANNELS = ["site", "email", "linkedin", "referral"] as const;
export type Channel = (typeof CHANNELS)[number];
export const isChannel = (s: unknown): s is Channel => typeof s === "string" && (CHANNELS as readonly string[]).includes(s);

export const OUTCOMES = ["rejected", "offer", "ghosted"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const isOutcome = (s: unknown): s is Outcome => typeof s === "string" && (OUTCOMES as readonly string[]).includes(s);

export interface SavedAnswer {
  application_id: number;
  qid: string; // bank id or "custom:<slug>"
  question: string;
  answer: string;
  max_chars: number;
  engine: string;
  updated_at: string;
}

/** Apply-safety facts computed server-side for the wizard (knock-outs, repeat application, ATS kind). */
export interface ApplySafety {
  knockouts: import("./knockout").Knockout[];
  repeat: { n: number; last: string | null };
  ats: import("./knockout").AtsKind | null;
}

export interface Pack {
  application_id: number;
  channel: Channel | null;
  reference: string;
  answers: { question: string; answer: string }[];
  submitted_at: string | null;
  outcome: Outcome | null;
  outcome_reason: string;
  lesson: string;
  outcome_at: string | null;
}
