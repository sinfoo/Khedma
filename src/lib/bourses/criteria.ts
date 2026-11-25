// What the student is looking for, how it travels in the URL, and a first guess read from the profile.
import { REGIONS } from "../geo";
import type { Profile } from "../types";
import { STUDY_FIELDS, STUDY_LEVELS, type Funding, type StudyField, type StudyLevel } from "./types";
import { todayYmd } from "./deadline";
import { fieldHits } from "./fields";
import { norm } from "./model";

export const FUNDINGS: readonly Funding[] = ["full", "partial", "tuition", "stipend", "mobility"];
export const WINDOWS = ["any", "open", "closing", "soon"] as const;
export type DeadlineWindow = (typeof WINDOWS)[number];

export interface Criteria {
  levels: StudyLevel[];
  fields: StudyField[];
  /** ISO country codes and region keys of `REGIONS` ("europe", "gulf"...). Empty means anywhere. */
  destinations: string[];
  funding: Funding[];
  fullOnly: boolean;
  /** Highest application fee in EUR the student accepts; 0 is free only, null is any. */
  maxFee: number | null;
  /** Languages the student can study in, ISO 639-1. */
  languages: string[];
  nationality: string;
  age: number | null;
  /** open: apply now. closing: deadline within `closingDays`. soon: opens within 8 weeks. */
  window: DeadlineWindow;
  closingDays: number;
  q: string;
}

export const EMPTY_CRITERIA: Criteria = { levels: [], fields: [], destinations: [], funding: [], fullOnly: false, maxFee: null, languages: [], nationality: "TN", age: null, window: "any", closingDays: 30, q: "" };

/**
 * Regions come from Khedma's job-market list; these host countries matter for scholarships and are missing there.
 * ponytail: move them into geo.ts when it grows the countries themselves.
 */
const REGION_EXTRA: Record<string, string[]> = {
  europe: ["CY", "MT", "RU", "RS", "UA"],
  uk: [],
  gulf: [],
  maghreb: ["MR"],
  asiaPacific: ["CN", "TW", "HK", "TH", "ID", "VN", "BN", "PK", "KZ"],
  latinAmerica: ["AR", "CO"],
  westAfrica: ["GH", "NG", "BJ", "TG", "BF", "ML"],
};
export const REGION_KEYS = REGIONS.map((r) => r.key as string);

/** Destinations as a set of ISO codes: countries as they are, regions expanded. */
export function destinationCodes(destinations: string[]): Set<string> {
  const out = new Set<string>();
  for (const d of destinations) {
    const region = REGIONS.find((r) => r.key === d);
    if (!region) out.add(d);
    else for (const c of [...region.codes, ...(REGION_EXTRA[d] ?? [])]) out.add(c);
  }
  return out;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((x) => String(x ?? "").trim()).filter(Boolean);
const among = <T extends string>(v: unknown, allowed: readonly T[]): T[] => [...new Set(list(v))].filter((x): x is T => (allowed as readonly string[]).includes(x));
const int = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,6}$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** Anything (a stored value, a form post, URL values) into valid criteria: unknown values are dropped. */
export function cleanCriteria(raw: unknown): Criteria {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nat = String(r.nationality ?? "").trim().toUpperCase();
  return {
    levels: among(r.levels, STUDY_LEVELS),
    fields: among(r.fields, STUDY_FIELDS),
    destinations: [...new Set(list(r.destinations).map((d) => (REGION_KEYS.includes(d) ? d : d.toUpperCase())))].filter((d) => REGION_KEYS.includes(d) || /^[A-Z]{2}$/.test(d)).slice(0, 40),
    funding: among(r.funding, FUNDINGS),
    fullOnly: r.fullOnly === true || r.fullOnly === "1",
    maxFee: int(r.maxFee, 0, 10_000),
    languages: [...new Set(list(r.languages).map((l) => l.toLowerCase()))].filter((l) => /^[a-z]{2}$/.test(l)).slice(0, 8),
    nationality: /^[A-Z]{2}$/.test(nat) ? nat : "TN",
    age: int(r.age, 10, 99),
    window: among(r.window, WINDOWS)[0] ?? "any",
    closingDays: int(r.closingDays, 1, 365) ?? 30,
    q: String(r.q ?? "").trim().slice(0, 80),
  };
}

const QUERY_KEYS = ["level", "field", "dest", "funding", "full", "fee", "lang", "nat", "age", "when", "days", "q"] as const;
type Query = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(",") : (v ?? ""));

/** Criteria written in the URL, or null when the URL names none (the page then falls back to the last ones used). */
export function criteriaFromQuery(sp: Query): Criteria | null {
  if (!QUERY_KEYS.some((k) => sp[k] !== undefined)) return null;
  return cleanCriteria({
    levels: first(sp.level),
    fields: first(sp.field),
    destinations: first(sp.dest),
    funding: first(sp.funding),
    fullOnly: first(sp.full),
    maxFee: first(sp.fee),
    languages: first(sp.lang),
    nationality: first(sp.nat),
    age: first(sp.age),
    window: first(sp.when),
    closingDays: first(sp.days),
    q: first(sp.q),
  });
}

/** The shortest query string that reads back as `c`. Empty criteria keep one key ("when=any") so the URL still wins. */
export function criteriaToQuery(c: Criteria): URLSearchParams {
  const p = new URLSearchParams();
  const put = (k: (typeof QUERY_KEYS)[number], v: string) => v && p.set(k, v);
  put("q", c.q);
  put("level", c.levels.join(","));
  put("field", c.fields.join(","));
  put("dest", c.destinations.join(","));
  put("funding", c.funding.join(","));
  put("full", c.fullOnly ? "1" : "");
  put("fee", c.maxFee === null ? "" : String(c.maxFee));
  put("lang", c.languages.join(","));
  put("nat", c.nationality === "TN" ? "" : c.nationality);
  put("age", c.age === null ? "" : String(c.age));
  put("when", c.window === "any" ? "" : c.window);
  put("days", c.window === "closing" && c.closingDays !== 30 ? String(c.closingDays) : "");
  if (![...p.keys()].length) p.set("when", "any");
  return p;
}

/** How many filters narrow the search (nationality counts only when it is not Tunisia). */
export function activeCount(c: Criteria): number {
  return c.levels.length + c.fields.length + c.destinations.length + c.funding.length + c.languages.length +
    [c.fullOnly, c.maxFee !== null, c.nationality !== "TN", c.age !== null, c.window !== "any", !!c.q].filter(Boolean).length;
}

// ---------- a first guess from the profile ----------

/** Where the student stands today, as far as the profile text shows. */
export type Stage = "phd-holder" | "phd-student" | "graduate" | "final-year" | "student" | "licence" | "school";

/** The level(s) to apply for next, most likely first. */
export const NEXT_LEVELS: Record<Stage, StudyLevel[]> = {
  "phd-holder": ["postdoc", "recherche"],
  "phd-student": ["recherche", "postdoc"],
  graduate: ["doctorat", "master"],
  "final-year": ["master", "doctorat"],
  student: ["master", "court"],
  licence: ["master", "court"],
  school: ["licence"],
};

const LANG_NAMES: Record<string, string> = { francais: "fr", french: "fr", anglais: "en", english: "en", arabe: "ar", arabic: "ar", allemand: "de", german: "de", deutsch: "de", espagnol: "es", spanish: "es", italien: "it", italian: "it" };

function stageOf(profile: Profile, today: string): Stage | null {
  const head = norm(`${profile.headline}\n${profile.target_roles.join("\n")}`);
  const all = `${head}\n${norm(profile.cv_md)}`.replace(/ph\.\s?d\.?/g, "phd");
  if (/\b(doctorant\w*|phd (student|candidate)|doctoral (student|candidate|researcher)|these en cours|en these)\b/.test(all)) return "phd-student";
  if (/\b(docteur en|phd (in|holder|graduate)|doctorat en|doctorate in|titulaire d'un doctorat|holds? a (phd|doctorate)|post[- ]?doc\w*)\b/.test(all)) return "phd-holder";
  const engineer = /\b(ingenieur\w*|engineering|cycle ingenieur|enit|ensi|insat|sup'?com|enis|enim|enig|enicarthage|esprit|polytechnique)\b/.test(all);
  const master = /\b(masters?|mastere|msc|m[12])\b/.test(all);
  const licence = /\b(licence|bachelors?|undergraduate|l[123]|cycle preparatoire|prepa|ipei\w*)\b/.test(all);
  if (!engineer && !master && !licence) return /\b(bac|baccalaureat|lycee|high school)\b/.test(all) ? "school" : null;

  // The latest year a study period ends: "2024 - 2027", "2024/2027", "depuis 2024 ... 2027".
  const ends = [...all.matchAll(/\b(20\d\d)\s*(?:-|–|—|\/|a|to)\s*(20\d\d)\b/g)].map((m) => Number(m[2]));
  const end = ends.length ? Math.max(...ends) : null;
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  // Academic years end in June or July: from September on, "ends this year" means the diploma is in hand.
  const done = end !== null && (end < year || (end === year && month >= 9));
  const lastYear = end !== null && !done && (end === year || (end === year + 1 && month >= 9));
  const saysFinal = /\b(pfe|projet de fin d'etudes|fin d'etudes|final[- ]year|derniere annee|last year|3 ?(e|eme|rd) annee|third[- ]year|5 ?(e|eme|th) annee|m2|master 2)\b/.test(head);
  const saysEarly = /\b(1 ?(ere|re|st) annee|first[- ]year|2 ?(e|eme|nd) annee|second[- ]year|m1|master 1)\b/.test(head);
  const saysDone = /\b(diplome|graduated|jeune diplome|ingenieur diplome|recent graduate|fresh graduate)\b/.test(head);

  if (!engineer && !master) return "licence";
  if (saysDone || (done && !saysFinal && !saysEarly)) return "graduate";
  if (saysEarly) return "student";
  if (saysFinal || lastYear) return "final-year";
  // Looking only for a final-year project is a last-year signal of its own.
  if (profile.target_types.length === 1 && profile.target_types[0] === "pfe") return "final-year";
  return "student";
}

export interface Inferred {
  criteria: Criteria;
  /** Why these defaults: shown next to them, so the guess is never hidden. */
  stage: Stage | null;
}

/** Editable defaults for a first search: field(s) and next level from the profile, the student's languages, Tunisia. */
export function inferCriteria(profile: Profile, today = todayYmd()): Inferred {
  const stage = stageOf(profile, today);
  // The headline, target roles and skills say what the student wants; the CV body counts for less.
  const strong = fieldHits(`${profile.headline}\n${profile.target_roles.join("\n")}\n${profile.skills.join("\n")}`);
  const weak = fieldHits(profile.cv_md);
  const scored = STUDY_FIELDS.map((f) => ({ f, n: (strong[f] ?? 0) * 3 + (weak[f] ?? 0) })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n);
  const fields: StudyField[] = scored.filter((x) => x.n * 2 >= scored[0].n).slice(0, 2).map((x) => x.f);
  const languages = [...new Set(profile.languages.map((l) => norm(l).trim()).map((l) => LANG_NAMES[l] ?? l))].filter((l) => /^[a-z]{2}$/.test(l));
  return { stage, criteria: { ...EMPTY_CRITERIA, levels: stage ? NEXT_LEVELS[stage] : [], fields, languages } };
}
