// What the engine and the screens read: a curated programme or a live call, in one shape.
import type { Coverage, Funding, Program, ProviderType, StudyField, StudyLevel } from "./types";

/**
 * A curated programme carries every fact. A live call only knows what its feed item says, so its facts may be
 * unknown: an empty list or null. Unknown facts never hide a result; they score lower than a known match.
 */
export interface Bourse {
  /** Route id: the programme slug, or "call-<n>" for a live call. */
  id: string;
  kind: "program" | "call";
  name: string;
  provider: string;
  providerType?: ProviderType;
  /** ISO codes, ["*"] when the holder picks the country, [] when unknown. */
  hostCountries: string[];
  levels: StudyLevel[];
  /** ["*"] for every field, [] when unknown. */
  fields: (StudyField | "*")[];
  funding: Funding | null;
  covers: Coverage | null;
  monthlyStipend?: { amount: number; currency: string };
  /** EUR, 0 when free, null when unknown. */
  applicationFee: number | null;
  eligibleNationalities: string[] | null;
  tunisiaEligible: boolean | null;
  languages: string[];
  languageTests?: string[];
  ageLimit?: number;
  opens?: string;
  /** "MM-DD", "MM" or "rolling" for a yearly programme; "YYYY-MM-DD" for a live call. */
  deadline?: string;
  url: string;
  /** Programmes: one or two sentences in our own words. Calls: empty, a feed's article text is never kept. */
  summary: { en: string; fr: string };
  /** Programmes: date the facts were checked. */
  verified?: string;
  /** Calls: feed id, its own tags and publication day, first and last scan that saw it, closed flag and the curated programme it belongs to. */
  feed?: string;
  tags?: string[];
  published?: string | null;
  firstSeen?: string;
  lastSeen?: string;
  closed?: boolean;
  programId?: string | null;
}

export const fromProgram = (p: Program): Bourse => ({ ...p, kind: "program" });

export const isCallId = (id: string) => /^call-\d+$/.test(id);

/** Lowercase without accents, for matching words in French and English text. */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const TRACK_STATUSES = ["saved", "preparing", "applied", "accepted", "rejected"] as const;
export type TrackStatus = (typeof TRACK_STATUSES)[number];

/** The student's own follow-up of one programme or call. */
export interface Tracking {
  item: string;
  status: TrackStatus;
  notes: string;
  /** Document keys the student ticked. */
  checklist: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}
