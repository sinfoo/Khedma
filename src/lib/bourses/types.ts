// Scholarships ("bourses"): the shared shape for the curated programme catalogue and for calls read from live feeds.

export const STUDY_LEVELS = ["licence", "master", "doctorat", "postdoc", "recherche", "court"] as const;
/** "recherche" is a research stay or fellowship; "court" is a short stay: exchange semester, summer school, training. */
export type StudyLevel = (typeof STUDY_LEVELS)[number];

export const STUDY_FIELDS = [
  "engineering",
  "computer-science",
  "mathematics",
  "natural-sciences",
  "medicine-health",
  "agriculture-environment",
  "architecture-urban",
  "business-economics",
  "law",
  "social-sciences",
  "humanities",
  "arts-design",
  "education",
] as const;
export type StudyField = (typeof STUDY_FIELDS)[number];

/** full: tuition and living costs. partial: part of the costs. tuition: fees only. stipend: living allowance only. mobility: travel or a short stay. */
export type Funding = "full" | "partial" | "tuition" | "stipend" | "mobility";

export type ProviderType = "government" | "eu" | "university" | "foundation" | "international-org" | "company";

/** Nationality groups a programme can target, next to ISO 3166-1 alpha-2 codes. "*" means any nationality. */
export type NationalityGroup = "*" | "africa" | "mena" | "maghreb" | "developing" | "francophonie" | "non-eu";

export interface Coverage {
  tuition: boolean;
  stipend: boolean;
  travel: boolean;
  insurance: boolean;
  housing: boolean;
}

/** One recurring scholarship programme from the curated catalogue. Facts are checked by hand on `verified`. */
export interface Program {
  /** Stable slug, e.g. "daad-epos". */
  id: string;
  name: string;
  /** The body that pays. */
  provider: string;
  providerType: ProviderType;
  /** ISO 3166-1 alpha-2 codes of the countries of study, or ["*"] when the holder picks the country. */
  hostCountries: string[];
  levels: StudyLevel[];
  /** Fields of study, or ["*"] for every field. */
  fields: (StudyField | "*")[];
  funding: Funding;
  covers: Coverage;
  /** Monthly allowance when the programme publishes one. */
  monthlyStipend?: { amount: number; currency: string };
  /** Fee the applicant pays to apply, in EUR. 0 when applying is free. */
  applicationFee: number;
  /** ISO codes or groups. ["*"] when open to every nationality. */
  eligibleNationalities: (string | NationalityGroup)[];
  /** True when a Tunisian citizen can apply. */
  tunisiaEligible: boolean;
  /** Languages of instruction, ISO 639-1. */
  languages: string[];
  /** Tests commonly asked, e.g. ["IELTS", "TOEFL", "TCF", "DELF"]. */
  languageTests?: string[];
  /** Maximum age at application, when the programme sets one. */
  ageLimit?: number;
  /** Month applications usually open, "MM". */
  opens?: string;
  /** Usual deadline: "MM-DD", "MM" when the day moves each year, or "rolling". */
  deadline?: string;
  /** Official page of the programme. */
  url: string;
  /** One or two sentences, in our own words. */
  summary: { en: string; fr: string };
  /** Date the facts above were checked, YYYY-MM-DD. */
  verified: string;
}
