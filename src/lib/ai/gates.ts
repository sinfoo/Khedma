// Eligibility and language gates (rank vetoes). Zero-LLM. "Silence is not permission":
// a gate fires only on explicit posting text, which is quoted verbatim so the user can judge.
import type { Evaluation, Job, Profile } from "../types";
import type { LangLevel } from "../cv/model";

export interface Gate {
  key: "citizenship" | "clearance" | "work_auth" | "language_missing" | "language_level";
  level: "fail" | "flag";
  quote: string; // verbatim posting sentence
  lang?: string; // canonical language name for language gates
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const clip = (s: string, n = 180) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const sentences = (text: string) => text.split(/(?<=[.;!?])\s+|\r?\n+/).map((s) => s.replace(/^[\s\-*•]+/, "").trim()).filter((s) => s.length >= 6);

const CITIZEN_RE = /\b(citizen(ship)?|nationalit[ée]|ressortissant|permanent resident|r[ée]sident permanent|green card)\b/i;
const CITIZEN_DEMAND_RE = /\b(must|only|required|requis|exig|obligatoire|r[ée]serv[ée]|uniquement|seuls?|be a|être|are a)\b/i;
const CLEARANCE_RE = /\b(security clearance|habilitation (secret|d[ée]fense|de s[ée]curit[ée])|secret clearance|top secret|clearance required)\b/i;
const WORK_AUTH_RE = /\b(authori[sz]ed to work|autoris[ée]e? [àa] travailler|work authori[sz]ation|right to work|permis de travail|eligible to work|without (visa )?sponsorship|sans (parrainage|sponsoring)|no (visa )?sponsorship|ne (sponsorisons|proposons) pas de visa|visa sponsorship (is )?not (available|provided|offered))\b/i;
const TUNISIA_RE = /\b(tunisi\w*)\b/i;

const LANGS: [string, RegExp][] = [
  ["Anglais", /\b(anglais|english)\b/i],
  ["Français", /\b(fran[cç]ais|french)\b/i],
  ["Arabe", /\b(arabe|arabic)\b/i],
  ["Allemand", /\b(allemand|german|deutsch)\b/i],
  ["Espagnol", /\b(espagnol|spanish)\b/i],
  ["Italien", /\b(italien|italian)\b/i],
  ["Néerlandais", /\b(n[ée]erlandais|dutch)\b/i],
  ["Japonais", /\b(japonais|japanese)\b/i],
];
const LANG_CODE: Record<string, string> = { fr: "Français", en: "Anglais", ar: "Arabe", de: "Allemand", es: "Espagnol", it: "Italien", nl: "Néerlandais", ja: "Japonais" };
const LANG_REQUIRED_RE = /\b(requis|required|exig|obligatoire|indispensable|imp[ée]ratif|must|mandatory|ma[îi]tris|courant|fluent|bilingu|native|natif|langue maternelle|professionnel|professional|niveau|level|c1|c2|b2)\b/i;
const PREFERRED_RE = /\b(souhait|appr[ée]ci|un plus|bonus|nice to have|preferred|optionnel|optional|id[ée]alement|ideally)\b/i;
const HIGH_BAR_RE =/\b(c1|c2|courant|fluent|bilingu|native|natif|langue maternelle|parfaite? ma[îi]trise|full professional)\b/i;
const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "native"];

/** The candidate's declared languages: profile extra (with CEFR), profile language codes, CV mentions. */
export function declaredLanguages(profile: Profile, langs: LangLevel[], cvText = profile.cv_md): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const l of langs) out.set(l.name.trim(), l.level);
  for (const c of profile.languages) {
    const name = LANG_CODE[c.toLowerCase()] ?? c;
    if (!out.has(name)) out.set(name, null);
  }
  const cv = fold(cvText);
  for (const [name, re] of LANGS) if (!out.has(name) && re.test(cv)) out.set(name, null);
  // Tunisian engineering students: French and Arabic are schooling languages when nothing is declared.
  if (!out.size) {
    out.set("Français", null);
    out.set("Arabe", null);
  }
  return out;
}

export function eligibilityGates(job: Job, profile: Profile, langs: LangLevel[] = [], cvText = profile.cv_md): Gate[] {
  const gates: Gate[] = [];
  const seen = new Set<string>();
  const declared = declaredLanguages(profile, langs, cvText);
  const declaredFold = new Map([...declared].map(([k, v]) => [fold(k), v]));
  for (const s of sentences(`${job.title}. ${job.description}`)) {
    if (CLEARANCE_RE.test(s)) push({ key: "clearance", level: "fail", quote: clip(s) });
    else if (CITIZEN_RE.test(s) && CITIZEN_DEMAND_RE.test(s) && !TUNISIA_RE.test(s)) push({ key: "citizenship", level: "fail", quote: clip(s) });
    else if (WORK_AUTH_RE.test(s) && !TUNISIA_RE.test(s)) push({ key: "work_auth", level: "fail", quote: clip(s) });
    if (!LANG_REQUIRED_RE.test(s) || PREFERRED_RE.test(s)) continue;
    for (const [name, re] of LANGS) {
      if (!re.test(s)) continue;
      const level = declaredFold.get(fold(name));
      if (!declaredFold.has(fold(name))) push({ key: "language_missing", level: "fail", quote: clip(s), lang: name });
      else if (HIGH_BAR_RE.test(s) && level && CEFR_ORDER.indexOf(level) < CEFR_ORDER.indexOf("C1")) push({ key: "language_level", level: "flag", quote: clip(s), lang: name });
    }
  }
  return gates;

  function push(g: Gate) {
    const k = `${g.key}:${g.lang ?? ""}`;
    if (seen.has(k)) return;
    seen.add(k);
    gates.push(g);
  }
}

/** A failed gate vetoes any score: the verdict drops to skip and the posting's own words lead the flags. */
export function applyGates<T extends Pick<Evaluation, "verdict" | "flags">>(ev: T, gates: Gate[], fr: boolean): T {
  const fails = gates.filter((g) => g.level === "fail");
  if (!fails.length) return ev;
  const label = fr ? "critère éliminatoire" : "eligibility gate";
  return { ...ev, verdict: "skip", flags: [...fails.map((g) => `${label}: “${g.quote}”`), ...ev.flags].slice(0, 6) };
}
