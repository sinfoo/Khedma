// Match scholarships to criteria: hard filters first, then a 0 to 100 score with the reasons behind it.
// Deterministic: the same items, criteria and day always give the same order.
import { FUNDINGS, destinationCodes, type Criteria } from "./criteria";
import { deadlineInfo, todayYmd, type DeadlineInfo } from "./deadline";
import { eligibility, type Eligibility } from "./eligibility";
import { norm, type Bourse } from "./model";
import { STUDY_FIELDS, STUDY_LEVELS, type Funding } from "./types";

/** Why a result is not shown. The first three always apply; the others only when the student set that filter. */
export type Blocker = "nationality" | "age" | "level" | "fee" | "field" | "destination" | "funding" | "language" | "deadline" | "keywords" | "closed";

export type ReasonKey = "field" | "fieldAny" | "level" | "fullyFunded" | "funding" | "free" | "lowFee" | "language" | "closing" | "open" | "rolling" | "soon" | "destination";
export interface Reason {
  key: ReasonKey;
  vars?: Record<string, string | number>;
}

export interface Verdict {
  /** 0 to 100. Meaningful even when blockers exist (the detail page shows both). */
  score: number;
  reasons: Reason[];
  blockers: Blocker[];
  eligibility: Eligibility;
  deadline: DeadlineInfo;
}
export interface Ranked extends Verdict {
  item: Bourse;
}

/** Points per axis; they add up to 100. */
export const WEIGHTS = { field: 25, level: 20, coverage: 20, deadline: 15, fee: 10, language: 10 } as const;
/** A fact the source does not give, or a filter the student did not set: neither a match nor a miss. */
const NEUTRAL = 0.5;

const COVERAGE: Record<Funding, number> = { full: 1, partial: 0.6, tuition: 0.5, stipend: 0.5, mobility: 0.35 };

/** ponytail: fixed rough rates, only to sort monthly amounts across currencies; never shown to the student. */
const EUR_RATE: Record<string, number> = { EUR: 1, USD: 0.92, GBP: 1.17, CHF: 1.05, CAD: 0.68, AUD: 0.6, JPY: 0.006, CNY: 0.13, HKD: 0.12, KRW: 0.00067, SEK: 0.088, NOK: 0.086, DKK: 0.134, TRY: 0.027, HUF: 0.0025, SAR: 0.245, AED: 0.25, QAR: 0.25, TND: 0.3, MAD: 0.092, MYR: 0.2, RUB: 0.01 };
export const monthlyEur = (b: Bourse) => (b.monthlyStipend ? b.monthlyStipend.amount * (EUR_RATE[b.monthlyStipend.currency.toUpperCase()] ?? 1) : 0);

const haystack = (b: Bourse) => norm(`${b.name} ${b.provider} ${b.summary.en} ${b.summary.fr} ${(b.tags ?? []).join(" ")} ${b.id}`);

export function evaluate(b: Bourse, c: Criteria, today = todayYmd()): Verdict {
  const blockers: Blocker[] = [];
  const reasons: Reason[] = [];
  let score = 0;
  const add = (axis: keyof typeof WEIGHTS, part: number, reason?: Reason | false) => {
    score += WEIGHTS[axis] * part;
    if (reason) reasons.push(reason);
  };

  const elig = eligibility(b, c.nationality);
  if (elig.eligible === false) blockers.push("nationality");
  if (c.age !== null && b.ageLimit !== undefined && c.age > b.ageLimit) blockers.push("age");
  if (b.closed) blockers.push("closed");

  // Field: a programme for the student's own field beats one open to every field.
  const fieldHit = c.fields.find((f) => b.fields.includes(f));
  if (!c.fields.length || !b.fields.length) add("field", NEUTRAL);
  else if (fieldHit) add("field", 1, { key: "field", vars: { field: fieldHit } });
  else if (b.fields.includes("*")) add("field", 0.7, { key: "fieldAny" });
  else blockers.push("field");

  // Level: the first level the student picked is the one they want most.
  const levelHit = c.levels.find((l) => b.levels.includes(l));
  if (!c.levels.length || !b.levels.length) add("level", NEUTRAL);
  else if (levelHit) add("level", levelHit === c.levels[0] ? 1 : 0.85, { key: "level", vars: { level: levelHit } });
  else blockers.push("level");

  // Coverage: full funding beats partial.
  if (!b.funding) add("coverage", NEUTRAL);
  else add("coverage", COVERAGE[b.funding], b.funding === "full" ? { key: "fullyFunded" } : { key: "funding", vars: { funding: b.funding } });
  if (c.fullOnly && b.funding && b.funding !== "full") blockers.push("funding");
  else if (c.funding.length && b.funding && !c.funding.includes(b.funding)) blockers.push("funding");

  // Application fee: free is best, 100 EUR or more earns nothing.
  if (b.applicationFee === null) add("fee", NEUTRAL);
  else add("fee", Math.max(0, 1 - b.applicationFee / 100), b.applicationFee === 0 ? { key: "free" } : b.applicationFee <= 30 && { key: "lowFee", vars: { fee: b.applicationFee } });
  if (c.maxFee !== null && b.applicationFee !== null && b.applicationFee > c.maxFee) blockers.push("fee");

  // Language: taught in a language the student can study in, their first one ideally.
  const lang = c.languages.find((l) => b.languages.includes(l));
  if (!c.languages.length || !b.languages.length) add("language", NEUTRAL);
  else if (lang) add("language", lang === c.languages[0] ? 1 : 0.8, { key: "language", vars: { lang } });
  else blockers.push("language");

  // Deadline: what can be applied to now comes first, the nearest deadline on top.
  const dl = deadlineInfo(b, today, c.closingDays);
  const days = dl.daysLeft ?? 0;
  if (dl.status === "closing") add("deadline", 1, { key: "closing", vars: { days } });
  else if (dl.status === "open") add("deadline", 0.9, { key: "open", vars: { days } });
  else if (dl.status === "rolling") add("deadline", 0.8, { key: "rolling" });
  else if (dl.status === "soon") add("deadline", 0.6, { key: "soon", vars: { days: dl.opensInDays ?? 0 } });
  else if (dl.status === "closed") add("deadline", b.kind === "call" ? 0 : 0.25);
  else add("deadline", 0.4);
  const open = dl.status === "open" || dl.status === "closing" || dl.status === "rolling";
  if ((c.window === "open" && !open) || (c.window === "closing" && dl.status !== "closing") || (c.window === "soon" && dl.status !== "soon")) blockers.push("deadline");

  // Destination: a filter, not a score. A programme where the holder picks the country fits any destination.
  if (c.destinations.length && b.hostCountries.length && !b.hostCountries.includes("*")) {
    const wanted = destinationCodes(c.destinations);
    const host = b.hostCountries.find((h) => wanted.has(h));
    if (host) reasons.push({ key: "destination", vars: { country: host } });
    else blockers.push("destination");
  }

  const words = norm(c.q).split(/\s+/).filter(Boolean);
  if (words.length) {
    const hay = haystack(b);
    if (!words.every((w) => hay.includes(w))) blockers.push("keywords");
  }

  return { score: Math.round(score), reasons, blockers, eligibility: elig, deadline: dl };
}

export type Sort = "match" | "deadline" | "amount";
export const SORTS: readonly Sort[] = ["match", "deadline", "amount"];

const byName = (a: Ranked, b: Ranked) => a.item.name.localeCompare(b.item.name) || a.item.id.localeCompare(b.item.id);
/** Next date that matters: the deadline while open, the opening day otherwise. Unknown and rolling go last. */
const nextDate = (r: Ranked) => (r.deadline.status === "closed" && r.item.kind === "call" ? "9999" : (r.deadline.date ?? "9999"));

export function sortRanked(list: Ranked[], sort: Sort): Ranked[] {
  const cmp: Record<Sort, (a: Ranked, b: Ranked) => number> = {
    match: (a, b) => b.score - a.score || nextDate(a).localeCompare(nextDate(b)) || byName(a, b),
    deadline: (a, b) => nextDate(a).localeCompare(nextDate(b)) || b.score - a.score || byName(a, b),
    amount: (a, b) => monthlyEur(b.item) - monthlyEur(a.item) || b.score - a.score || byName(a, b),
  };
  return [...list].sort(cmp[sort]);
}

/** Everything that passes the filters, best match first. */
export function rank(items: Bourse[], c: Criteria, today = todayYmd()): Ranked[] {
  const kept = items.map((item) => ({ item, ...evaluate(item, c, today) })).filter((r) => !r.blockers.length);
  return sortRanked(kept, "match");
}

export interface Facets {
  levels: Record<string, number>;
  fields: Record<string, number>;
  /** By ISO code; "*" counts programmes where the holder picks the country. */
  countries: Record<string, number>;
  funding: Record<string, number>;
  languages: Record<string, number>;
}

/** For each option of a facet: how many results it would give with the other filters left as they are. */
export function facets(items: Bourse[], c: Criteria, today = todayYmd()): Facets {
  const out: Facets = { levels: {}, fields: {}, countries: {}, funding: {}, languages: {} };
  const bump = (table: Record<string, number>, keys: readonly string[]) => keys.forEach((k) => (table[k] = (table[k] ?? 0) + 1));
  for (const b of items) {
    const blockers = evaluate(b, c, today).blockers;
    const only = (own: Blocker) => blockers.every((x) => x === own);
    if (only("level")) bump(out.levels, b.levels.length ? b.levels : STUDY_LEVELS);
    if (only("field")) bump(out.fields, !b.fields.length || b.fields.includes("*") ? STUDY_FIELDS : b.fields);
    if (only("destination")) bump(out.countries, b.hostCountries);
    if (only("funding")) bump(out.funding, b.funding ? [b.funding] : FUNDINGS);
    if (only("language")) bump(out.languages, b.languages);
  }
  return out;
}
