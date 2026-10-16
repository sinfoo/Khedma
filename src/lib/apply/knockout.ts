// Apply safety, pure: knock-out pre-scan of the posting against the profile, ATS detection from the
// posting URL, and the eligibility gates folded in as warnings. No DB, no network.
import type { Job, Profile } from "../types";
import type { ProfileExtra } from "../cv/model";
import { detectSeniorityMonths } from "../recommend/profile-model";
import { eligibilityGates, declaredLanguages, type Gate } from "../ai/gates";

export interface Knockout {
  key: "years" | "degree" | "visa" | "unpaid" | "language" | "onsite" | "gate";
  level: "danger" | "warn";
  quote: string;
  vars: Record<string, string | number>;
  gate?: Gate;
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const clip = (s: string, n = 180) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const sentences = (text: string) => text.split(/(?<=[.;!?])\s+|\r?\n+/).map((s) => s.replace(/^[\s\-*•]+/, "").trim()).filter((s) => s.length >= 6);

const YEARS_RE = /(\d{1,2})\s*\+?\s*(ans|ann[ée]es?|years?|yrs)\b[^.]{0,40}?(exp[ée]rience|experience)|(exp[ée]rience|experience)[^.]{0,40}?(\d{1,2})\s*\+?\s*(ans|ann[ée]es?|years?|yrs)\b/i;
const DEGREE_RE = /\b(bac\s*\+\s*5|master|mast[èe]re|ing[ée]nieur dipl[ôo]m[ée]|dipl[ôo]m[ée]\s+(d'ing[ée]nieur|ing[ée]nieur|bac)|doctorat|phd|ph\.d|docteur|graduated|degree required|dipl[ôo]me (requis|exig[ée])|titulaire d'un)\b/i;
const STUDENT_LEVEL_RE = /\b(1|2|3)(re|e|ère|ème)?\s*ann[ée]e|year\s*[123]\b|[ée]l[èe]ve|[ée]tudiant|student/i;
const UNPAID_RE = /\b(non[- ]r[ée]mun[ée]r|unpaid|sans r[ée]mun[ée]ration|b[ée]n[ée]vol|sans gratification)\b/i;
const ONSITE_RE = /\b(sur site|on[- ]site|onsite|pr[ée]sentiel|in[- ]office|au bureau|100 ?% (sur site|pr[ée]sentiel))\b/i;
const HIGH_BAR_RE = /\b(c1|c2|courant|fluent|bilingu|native|natif|langue maternelle|parfaite? ma[îi]trise)\b/i;
const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "native"];

/** Knock-out criteria in the posting that the profile may not satisfy. Each one quotes the sentence it comes from. */
export function knockouts(job: Job, profile: Profile, extra: ProfileExtra, cvText = profile.cv_md): Knockout[] {
  const out: Knockout[] = [];
  const text = `${job.title}. ${job.description}`;
  const months = detectSeniorityMonths(cvText);
  const isStudent = !extra.level || STUDENT_LEVEL_RE.test(extra.level) || STUDENT_LEVEL_RE.test(profile.headline);
  const places = [...profile.target_locations, ...extra.places.cities, extra.city].filter(Boolean).map(fold);
  const declared = declaredLanguages(profile, extra.langs, cvText);
  let years = false, degree = false, unpaid = false, onsite = false, language = false;

  for (const s of sentences(text)) {
    const m = s.match(YEARS_RE);
    if (!years && m) {
      const n = Number(m[1] ?? m[5]);
      if (n >= 1 && n * 12 > months) {
        years = true;
        out.push({ key: "years", level: n >= 3 ? "danger" : "warn", quote: clip(s), vars: { n, have: Math.round((months / 12) * 10) / 10 } });
      }
    }
    if (!degree && DEGREE_RE.test(s) && isStudent && /\b(requis|required|exig|obligatoire|indispensable|must|titulaire|dipl[ôo]m[ée])\b/i.test(s)) {
      degree = true;
      out.push({ key: "degree", level: /doctorat|phd|ph\.d|docteur/i.test(s) ? "danger" : "warn", quote: clip(s), vars: { deg: s.match(DEGREE_RE)?.[0] ?? "" } });
    }
    if (!unpaid && UNPAID_RE.test(s)) {
      unpaid = true;
      out.push({ key: "unpaid", level: "warn", quote: clip(s), vars: {} });
    }
    if (!onsite && ONSITE_RE.test(s) && !job.remote && job.location && places.length && !places.some((p) => fold(job.location).includes(p) || p.includes(fold(job.location)))) {
      onsite = true;
      out.push({ key: "onsite", level: "warn", quote: clip(s), vars: { city: job.location } });
    }
    if (!language && HIGH_BAR_RE.test(s)) {
      for (const [name, level] of declared) {
        if (!new RegExp(`\\b${fold(name).slice(0, 4)}`, "i").test(fold(s))) continue;
        if (level && CEFR_ORDER.indexOf(level) < CEFR_ORDER.indexOf("C1")) {
          language = true;
          out.push({ key: "language", level: "warn", quote: clip(s), vars: { lang: name } });
        }
      }
    }
  }
  for (const g of eligibilityGates(job, profile, extra.langs, cvText)) {
    if (g.key === "language_level") continue; // already reported above as "language"
    out.push({ key: g.key === "language_missing" ? "language" : "gate", level: g.level === "fail" ? "danger" : "warn", quote: g.quote, vars: { lang: g.lang ?? "" }, gate: g });
  }
  return out;
}

// ---------- ATS detection from the posting URL ----------
export type AtsKind = "ashby" | "lever" | "workday" | "successfactors" | "greenhouse" | "workable" | "smartrecruiters";
const ATS: [AtsKind, RegExp][] = [
  ["ashby", /ashbyhq\.com/i],
  ["lever", /lever\.co/i],
  ["workday", /myworkdayjobs\.com|workday\.com/i],
  ["successfactors", /successfactors\.(com|eu)|sapsf\.|jobs\.sap\.com/i],
  ["greenhouse", /greenhouse\.io/i],
  ["workable", /workable\.com/i],
  ["smartrecruiters", /smartrecruiters\.com/i],
];

export function atsKind(url: string): AtsKind | null {
  return ATS.find(([, re]) => re.test(url))?.[0] ?? null;
}
