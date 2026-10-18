export type Locale = "fr" | "en";

export type JobType = "stage" | "pfe" | "emploi" | "alternance" | "freelance";

export const JOB_TYPES: JobType[] = ["stage", "pfe", "emploi", "alternance", "freelance"];

/** Application lifecycle. Order matters: later = further in the funnel. */
export const APP_STATES = [
  "evaluated",
  "applied",
  "responded",
  "interview",
  "offer",
  "hired",
  "rejected",
  "discarded",
] as const;
export type AppState = (typeof APP_STATES)[number];
export const TERMINAL_STATES: AppState[] = ["offer", "hired", "rejected", "discarded"];

export type SourceKind =
  | "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters" | "recruitee" | "personio" | "pinpoint" | "rss" | "keejob" | "tanitjobs" | "emploitunisie" | "farojob" | "linkedin"
  | "arbeitnow" | "englishjobs_de" | "englishjobs_fr" | "englishjobs_ch" | "jobsch" | "jobup" | "jobroom" | "jobbank" | "daijob" | "wantedly"
  | "remoteok" | "jobicy" | "himalayas" | "remotive" | "aijobs" | "adzuna" | "jooble" | "reed" | "findwork" | "arbeitsagentur" | "weworkremotely" | "eures"
  | "url" | "manual" | "demo";

export interface Profile {
  id: 1;
  name: string;
  email: string;
  headline: string;
  cv_md: string;
  skills: string[];
  target_roles: string[];
  target_locations: string[];
  target_types: JobType[];
  languages: string[];
  settings: Settings;
}

export interface Settings {
  locale: Locale;
  theme: "system" | "light" | "dark";
  ollama_url: string;
  ollama_model: string;
  /** "auto" = Claude when ANTHROPIC_API_KEY works, else Ollama, else heuristic. */
  provider: "auto" | "claude" | "ollama" | "offline";
  claude_model: string;
}

export const DEFAULT_SETTINGS: Settings = {
  locale: "fr",
  theme: "system",
  ollama_url: "http://127.0.0.1:11434",
  ollama_model: "llama3.1",
  provider: "auto",
  claude_model: "claude-sonnet-5-5",
};

export interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  source: SourceKind;
  type: JobType;
  description: string;
  tags: string[];
  posted_at: string | null;
  deadline: string | null;
  created_at: string;
  archived: boolean;
  starred: boolean;
}

// ---------- evaluation v2 (requirement → evidence table, legitimacy, comp reliability, triage) ----------
export const IMPORTANCE = ["critical", "high", "meaningful", "preferred", "low_signal"] as const;
export type Importance = (typeof IMPORTANCE)[number];
export const EVIDENCE_TIERS = ["stated", "structural", "inferred"] as const;
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

export interface Requirement {
  text: string;
  importance: Importance;
  evidence: EvidenceTier; // inferred rows are never critical/high
  met: "yes" | "partial" | "no";
  proof: string; // verbatim CV line backing a yes/partial, "" otherwise
}

export type LegitimacyTier = "high" | "caution" | "suspicious";
export interface Legitimacy {
  tier: LegitimacyTier;
  score: number; // 0-100, zero-LLM
  signals: { key: string; delta: number }[];
}

export const COMPANY_TYPES = [
  "big_tech", "growth_startup", "early_startup", "enterprise", "agency", "local_smb", "commission", "staffing", "public_academic", "community", "unknown",
] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];
export type CompReliability = "high" | "medium" | "low" | "unknown";

export interface Triage {
  score: number; // 0-100
  verdict: "pass" | "marginal" | "fail";
  reason: string;
  skipped: boolean; // true when the full evaluation was not run because of this verdict
}

export interface Evaluation {
  id: number;
  job_id: number;
  global: number; // 1-5, one decimal
  match: number;
  target: number;
  growth: number;
  culture: number;
  red_flags: number; // 1 = many red flags, 5 = none
  strengths: string[];
  gaps: string[];
  flags: string[];
  verdict: "apply_now" | "apply" | "maybe" | "skip";
  summary: string;
  engine: string; // "ollama:llama3.1" | "heuristic"
  created_at: string;
  // v2 (optional: rows written before the v2 migration have none)
  requirements?: Requirement[];
  legitimacy?: Legitimacy;
  company_type?: CompanyType;
  comp_reliability?: CompReliability;
  level_plan?: string;
  cv_changes?: string[];
  archetype?: string;
  triage?: Triage;
}

export interface Application {
  id: number;
  job_id: number;
  status: AppState;
  notes: string;
  cv_md: string | null;
  cover_letter_md: string | null;
  interview_prep: InterviewPrep | null;
  applied_at: string | null;
  next_action_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InterviewPrep {
  pitch: string;
  likely_questions: { question: string; why: string; approach: string }[];
  star_stories: { title: string; situation: string; task: string; action: string; result: string }[];
  questions_to_ask: string[];
  engine: string;
}

export interface AppEvent {
  id: number;
  application_id: number;
  kind: "status" | "note" | "followup" | "doc" | "interview" | "message" | "outcome";
  payload: string;
  created_at: string;
}

export interface Source {
  id: number;
  kind: Exclude<SourceKind, "url" | "manual" | "demo">;
  label: string;
  handle: string; // board slug or feed url
  enabled: boolean;
  last_scan: string | null;
  last_count: number;
}

export interface SkillGap {
  skill: string;
  demand: number; // how many target jobs mention it
  have: boolean;
  jobs: number[];
}

export interface UpskillPlan {
  gaps: SkillGap[];
  plan: { skill: string; priority: 1 | 2 | 3; why: string; steps: string[]; resources: { title: string; url: string }[] }[];
  engine: string;
  created_at: string;
}

export interface Contact {
  id: number;
  application_id: number;
  name: string;
  role: string;
  email: string;
  phone: string;
  linkedin: string;
  notes: string;
  created_at: string;
}

export const INTERVIEW_KINDS = ["phone", "hr", "technical", "case", "onsite", "final"] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

export interface Interview {
  id: number;
  application_id: number;
  starts_at: string; // ISO local datetime "2026-10-20T14:00"
  duration_min: number;
  kind: InterviewKind;
  location: string;
  notes: string;
  outcome: string;
  created_at: string;
}

export interface Reminder {
  id: number;
  application_id: number | null;
  job_id: number | null;
  title: string;
  due_at: string; // ISO date or datetime
  done: boolean;
  created_at: string;
}
