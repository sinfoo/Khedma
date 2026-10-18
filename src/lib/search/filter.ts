// Title / seniority / location / type / language filter with career-ops semantics (positive + negative
// keyword lists, `word:` and `stem:` prefixes, location tiers block_hard > always_allow > block > allow).
// Every decision carries its reasons so the UI can say why an offer was dropped or kept. Pure.
import type { NewJob } from "../db";
import type { JobType, Profile } from "../types";
import { COUNTRIES, countryOf, REMOTE_CODE } from "../geo";
import { tokenize } from "../recommend/similarity";
import type { SearchPrefs } from "./prefs";

export interface Decision {
  keep: boolean;
  /** Codes such as "title:dev,data", "senior:word:senior", "location:france", "type:emploi", "lang:de". */
  reasons: string[];
}

export const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ---------- keyword matchers (career-ops title_filter semantics) ----------
const WORD = String.raw`[\p{L}\p{M}\p{N}_]`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const anchored = (body: string) => new RegExp(`(?<!${WORD})${body}(?!${WORD})`, "u");
const stemmed = (body: string) => new RegExp(`(?<!${WORD})${body}`, "u");

/**
 * Compile one keyword into a matcher over folded (lowercase, accent-free) text.
 * `word:x` whole word, `stem:x` must start a word, 2-3 letter acronyms are whole words,
 * `a + b` requires both, anything else is a substring.
 */
export function compileKeyword(raw: string): (folded: string) => boolean {
  const kw = fold(raw).trim();
  if (kw.includes(" + ")) {
    const parts = kw.split(" + ").map((p) => p.trim()).filter(Boolean).map(compileKeyword);
    return (s) => parts.every((m) => m(s));
  }
  if (kw.startsWith("word:")) {
    const b = kw.slice(5).trim();
    if (!b) return () => false;
    const re = anchored(esc(b));
    return (s) => re.test(s);
  }
  if (kw.startsWith("stem:")) {
    const b = kw.slice(5).trim();
    if (!b) return () => false;
    const re = stemmed(esc(b));
    return (s) => re.test(s);
  }
  if (/^[a-z]{2,3}$/.test(kw)) {
    const re = anchored(kw);
    return (s) => re.test(s);
  }
  return (s) => s.includes(kw);
}

const bare = (kw: string) => kw.replace(/^(word|stem):/, "");

// ---------- positives: search keywords + target roles, synonym-folded ----------
// Words that describe the contract, not the role; the type gate handles them.
const TYPE_TOKENS = new Set(["internship", "pfe", "alternance", "junior", "emploi", "cdi", "cdd", "sivp", "job", "offre", "offer", "poste", "position", "h/f", "f/h"]);
// Title-level equivalence: a "développeur", an "ingénieur logiciel" and a "software engineer" are the same hire.
const ROLE_CLASS: Record<string, string> = { dev: "build", engineer: "build", software: "build", programm: "build" };
const TECH_TOKENS = new Set(["build", "backend", "frontend", "fullstack", "mobile", "ml", "embedded", "network", "security", "cloud", "devops", "telecom", "electrical", "mechanical", "data", "db", "test", "web", "industrial", "civil"]);

export interface Positive {
  raw: string;
  /** Canonical role tokens (empty = generic entry such as "stage"). */
  tokens: string[];
  /** Explicit `word:` / `stem:` entries keep career-ops substring semantics. */
  matcher?: (folded: string) => boolean;
}

const canon = (w: string) => ROLE_CLASS[w] ?? w;
export const titleTokens = (s: string) => new Set(tokenize(s).map(canon));

export function compilePositives(entries: string[]): Positive[] {
  const out: Positive[] = [];
  for (const raw of entries.map((e) => e.trim()).filter(Boolean)) {
    if (/^(word|stem):/.test(raw)) out.push({ raw, tokens: [], matcher: compileKeyword(raw) });
    else out.push({ raw, tokens: [...new Set(tokenize(raw).filter((t) => !TYPE_TOKENS.has(t)).map(canon))] });
  }
  return out;
}

export interface TitleMatch {
  /** 0..1: share of the best entry's tokens found in the title (1 for a matcher or substring hit). */
  score: number;
  hits: string[];
}

/** Best positive entry against a title. Generic entries (no role tokens) match everything with score 0. */
export function titleMatch(title: string, positives: Positive[]): TitleMatch | null {
  const folded = fold(title);
  const toks = titleTokens(title);
  // "stage" or "pfe" alone means "any internship"; next to a real role it must not let every title through.
  const specific = positives.some((p) => p.matcher || p.tokens.length);
  let best: TitleMatch | null = null;
  for (const p of positives) {
    let m: TitleMatch | null = null;
    if (p.matcher) m = p.matcher(folded) ? { score: 1, hits: [bare(p.raw)] } : null;
    else if (!p.tokens.length) m = specific ? null : { score: 0, hits: [] };
    else if (folded.includes(fold(p.raw))) m = { score: 1, hits: [p.raw] };
    else {
      const hits = p.tokens.filter((t) => toks.has(t));
      if (hits.length && hits.length >= Math.ceil(p.tokens.length / 2)) m = { score: hits.length / p.tokens.length, hits };
    }
    if (m && (!best || m.score > best.score)) best = m;
  }
  return best;
}

// ---------- negatives ----------
/** Roles a student cannot take. Skipped when the title itself says internship. */
export const SENIOR_NEGATIVES = [
  "word:senior", "word:sr", "word:lead", "word:principal", "word:staff", "head of", "word:director", "word:directeur", "word:directrice",
  "word:manager", "word:responsable", "word:expert", "word:experte", "word:confirme", "word:confirmee", "word:experimente", "word:experimentee",
  "word:vp", "word:cto", "word:chief", "word:architect", "word:architecte",
];
/** Non-technical roles that keyword searches drag in ("business developer", "ingénieur commercial"). */
export const SALES_NEGATIVES = [
  "word:commercial", "word:commerciale", "word:commerciaux", "word:sales", "business developer", "business development", "account manager", "account executive",
  "word:vendeur", "word:vendeuse", "televente", "teleconseiller", "teleconseillere", "word:telesales", "word:comptable", "word:recruteur", "word:recruiter",
  "ressources humaines", "word:marketing", "word:juriste", "customer success", "word:caissier", "word:caissiere",
];
const INTERN_TITLE = /\b(stage|stagiaire|intern|internship|pfe|alternan|apprenti|werkstudent|praktik)/;
const BIZDEV = /(sales|business)\s+develop/;
// "5+ ans", "7 years", "3 ans minimum" in a title; in a body only when framed as a requirement.
const YEARS_TITLE = /\b([3-9]|1\d)\s*\+?\s*(ans|years?|yrs)\b/;
const YEARS_BODY = /\b(minimum|min\.?|at least|au moins|plus de|more than|over)\s+(de\s+)?([3-9]|1\d)\s*\+?\s*(ans|years?)\b|\b([3-9]|1\d)\s*\+?\s*(ans|years?)\s*(minimum|d'?experience|of experience|experience|exp\b)/;
const JUNIOR = /\b(junior|debutant|debutante|graduate|entry[- ]level|jeune diplome|fresh grad|new grad)\b/;

// ---------- location tiers ----------
export interface LocationRules {
  block_hard: string[];
  always_allow: string[];
  block: string[];
  allow: string[];
}

/** Tiers from the chosen places: chosen countries (aliases + cities) always pass, other countries are hard-blocked, their cities blocked. */
export function locationRules(places: { countries: string[]; cities?: string[] }): LocationRules {
  const chosen = places.countries.filter((c) => c !== REMOTE_CODE);
  const rules: LocationRules = { block_hard: [], always_allow: [], block: [], allow: [] };
  if (!chosen.length) return rules;
  for (const c of COUNTRIES) {
    if (chosen.includes(c.code)) rules.always_allow.push(...c.aliases, ...c.cities);
    else {
      rules.block_hard.push(...c.aliases);
      rules.block.push(...c.cities);
    }
  }
  rules.always_allow.push(...(places.cities ?? []));
  return rules;
}

export function compileLocation(rules: LocationRules) {
  const list = (xs: string[]) => xs.map((x) => compileKeyword(`word:${x}`));
  const hard = list(rules.block_hard);
  const always = list(rules.always_allow);
  const block = list(rules.block);
  const allow = list(rules.allow);
  return (location: string): { keep: boolean; term?: string } => {
    const l = fold(location).trim();
    if (!l) return { keep: true };
    const find = (ms: ((s: string) => boolean)[], src: string[]) => {
      const i = ms.findIndex((m) => m(l));
      return i >= 0 ? src[i] : undefined;
    };
    const h = find(hard, rules.block_hard);
    if (h) return { keep: false, term: h };
    const a = find(always, rules.always_allow);
    if (a) return { keep: true, term: a };
    const b = find(block, rules.block);
    if (b) return { keep: false, term: b };
    if (!allow.length) return { keep: true };
    const al = find(allow, rules.allow);
    return al ? { keep: true, term: al } : { keep: false };
  };
}

// ---------- language ----------
const CJK = /[぀-ヿ一-鿿가-힯]/;
const DE_STOP = /\b(und|fur|mit|wir|sie|nicht|werden|bei|eine|einen|oder|auch|sind|ihre|unsere|als|zum|zur|uber|sowie)\b/g;
const FREN_STOP = /\b(the|and|with|for|you|will|les|des|une|pour|avec|vous|nous|dans)\b/g;

function foreignLanguage(text: string): "ja" | "de" | null {
  if (CJK.test(text)) return "ja";
  if (text.length < 200) return null;
  const de = (text.match(DE_STOP) ?? []).length;
  if (de >= 6 && de > (text.match(FREN_STOP) ?? []).length) return "de";
  return null;
}

// ---------- the filter ----------
export interface FilterOptions {
  keywords: string[];
  profile: Pick<Profile, "target_roles" | "target_types">;
  places: { countries: string[]; cities?: string[]; remote: "yes" | "only" | "no" };
  /** Overrides the profile's target types. */
  types?: JobType[];
  extraNegatives?: string[];
  includeSenior?: boolean;
  /** Work preferences: levels widen/narrow the type gate, blacklists and freshness drop offers. */
  prefs?: Pick<SearchPrefs, "levels" | "hoursOld" | "titleBlacklist" | "companyBlacklist" | "locationReject" | "includeSenior">;
  now?: number;
}

export interface JobFilter {
  positives: Positive[];
  types: JobType[];
  decide: (job: Pick<NewJob, "title" | "company" | "description" | "location" | "remote" | "type" | "posted_at">) => Decision;
}

const INTERN_TYPES: JobType[] = ["stage", "pfe", "alternance"];

export function buildFilter(o: FilterOptions): JobFilter {
  const prefs = o.prefs;
  const includeSenior = o.includeSenior || prefs?.includeSenior || false;
  const positives = compilePositives([...o.keywords, ...o.profile.target_roles]);
  const technical = positives.some((p) => p.tokens.some((t) => TECH_TOKENS.has(t)));
  const wantsArchitect = positives.some((p) => p.tokens.includes("architect") || /architect/i.test(p.raw));
  const senior = includeSenior ? [] : SENIOR_NEGATIVES.filter((k) => wantsArchitect ? !k.includes("architect") : true);
  const negatives: [string, (s: string) => boolean, string][] = [
    ...senior.map((k): [string, (s: string) => boolean, string] => [k, compileKeyword(k), "senior"]),
    ...(technical ? SALES_NEGATIVES : []).map((k): [string, (s: string) => boolean, string] => [k, compileKeyword(k), "sales"]),
    ...(o.extraNegatives ?? []).filter((k) => k.trim()).map((k): [string, (s: string) => boolean, string] => [k, compileKeyword(k), "negative"]),
    ...(prefs?.titleBlacklist ?? []).map((k): [string, (s: string) => boolean, string] => [k, compileKeyword(k), "blacklist"]),
  ];
  const companyBlock = (prefs?.companyBlacklist ?? []).map((k) => [k, compileKeyword(k)] as const);
  // Levels: "intern" = internship kinds, "entry"/"mid" open full-time roles (junior wording required only when "entry" alone).
  const fromLevels: JobType[] = prefs?.levels?.length ? [...(prefs.levels.includes("intern") ? INTERN_TYPES : []), ...(prefs.levels.some((l) => l !== "intern") ? (["emploi"] as JobType[]) : [])] : [];
  const types = (o.types?.length ? o.types : fromLevels.length ? fromLevels : o.profile.target_types).filter(Boolean);
  const internOnly = types.length > 0 && types.every((t) => INTERN_TYPES.includes(t));
  const entryOnly = !internOnly && !!prefs?.levels?.length && !prefs.levels.includes("mid");
  const chosen = o.places.countries.filter((c) => c !== REMOTE_CODE);
  const rules = locationRules(o.places);
  rules.block_hard.push(...(prefs?.locationReject ?? []));
  const location = compileLocation(rules);
  const langOk = (l: "ja" | "de") => (l === "ja" ? chosen.some((c) => c === "JP" || c === "KR") : chosen.some((c) => c === "DE" || c === "CH" || c === "AT"));
  const maxAgeMs = prefs?.hoursOld ? prefs.hoursOld * 3_600_000 : 0;

  const decide: JobFilter["decide"] = (job) => {
    const reasons: string[] = [];
    const title = fold(job.title);
    const intern = INTERN_TITLE.test(title);

    // 0. blacklisted employers and stale postings
    const company = fold(job.company);
    for (const [kw, m] of companyBlock) if (m(company)) return { keep: false, reasons: [`blacklist:${bare(kw)}`] };
    if (maxAgeMs && job.posted_at) {
      const t = new Date(job.posted_at).getTime();
      if (!Number.isNaN(t) && (o.now ?? Date.now()) - t > maxAgeMs) return { keep: false, reasons: [`age:${Math.floor(((o.now ?? Date.now()) - t) / 86_400_000)}`] };
    }

    // 1. contract type
    if (types.length && !types.includes(job.type)) {
      if (internOnly && job.type === "emploi" && JUNIOR.test(title)) reasons.push("junior");
      else return { keep: false, reasons: [`type:${job.type}`] };
    } else if (entryOnly && job.type === "emploi" && !intern && !JUNIOR.test(title) && !includeSenior) {
      // No "mid" level: a full-time role must read as junior.
      return { keep: false, reasons: ["type:emploi"] };
    }

    // 2. title must name a target role
    const m = titleMatch(job.title, positives);
    if (positives.length && !m) return { keep: false, reasons: ["title"] };
    if (m?.hits.length) reasons.push(`title:${m.hits.join(",")}`);

    // 3. negatives: seniority (unless the title says internship), sales roles without a technical word, user list.
    // "Business/Sales Developer" is a sales role: its "developer" does not count as technical.
    const bizdev = BIZDEV.test(title) && !/(engineer|ingenieur|software|logiciel|web|full\s?stack)/.test(title);
    const techTitle = [...titleTokens(job.title)].some((t) => TECH_TOKENS.has(t) && !(bizdev && t === "build"));
    for (const [kw, match, kind] of negatives) {
      if (kind === "senior" && intern) continue;
      if (kind === "sales" && techTitle) continue;
      if (match(title)) return { keep: false, reasons: [`${kind}:${bare(kw)}`] };
    }
    if (!intern && !includeSenior) {
      const years = YEARS_TITLE.exec(title) ?? (job.type === "emploi" ? YEARS_BODY.exec(fold(job.description).slice(0, 6000)) : null);
      if (years) return { keep: false, reasons: [`senior:${years[0].trim()}`] };
    }

    // 4. location tiers + remote preference
    const loc = location(job.location);
    if (!loc.keep) return { keep: false, reasons: [`location:${loc.term ?? job.location}`] };
    const code = countryOf(job.location);
    const isRemote = job.remote || code === REMOTE_CODE;
    if (o.places.remote === "only" && !isRemote) return { keep: false, reasons: ["remote"] };
    if (o.places.remote === "no" && isRemote && (!code || code === REMOTE_CODE)) return { keep: false, reasons: ["remote"] };
    if (code && code !== REMOTE_CODE && chosen.includes(code)) reasons.push(`place:${code}`);
    else if (isRemote) reasons.push("remote");

    // 5. language: German or Japanese-only postings when those countries are not targeted
    const lang = foreignLanguage(`${job.title} ${job.description.slice(0, 1500)}`);
    if (lang && !langOk(lang)) return { keep: false, reasons: [`lang:${lang}`] };

    return { keep: true, reasons };
  };

  return { positives, types, decide };
}

/** "senior:word:senior" -> "senior": the bucket a dropped offer counts in. */
export const dropBucket = (reasons: string[]) => (reasons[0] ?? "other").split(":")[0];
