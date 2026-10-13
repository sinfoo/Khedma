// CV health check: deterministic rules on the CV text (Markdown or plain). Pure, client-safe.
import { headingKey, isBullet, stripBullet, wordCount, type SectionKey } from "./sectionize";

export type Severity = "high" | "medium" | "low";
export type HealthId =
  | "empty"
  | "tooShort"
  | "tooLong"
  | "noEducation"
  | "noExperience"
  | "noSkills"
  | "noLanguages"
  | "noEmail"
  | "noPhone"
  | "noLinks"
  | "fewActionVerbs"
  | "fewNumbers"
  | "longBullets"
  | "firstPerson"
  | "dateOrder"
  | "dateFormats";

export interface Finding {
  id: HealthId;
  severity: Severity;
  n?: number; // count used in the message
  sample?: string; // offending excerpt
}

export interface HealthReport {
  score: number; // 0-100
  findings: Finding[];
  passed: HealthId[];
  stats: { words: number; bullets: number; actionBullets: number; quantified: number; sections: SectionKey[] };
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Stems of strong action verbs / nominalized actions (FR + EN), matched on the first word.
const ACTION_STEMS = [
  "develop", "concu", "concev", "concep", "mis en place", "mise en place", "realis", "implement", "cree", "creat", "crea",
  "optimi", "automat", "deplo", "gere", "gest", "dirig", "pilot", "organis", "analys", "amelior", "redui", "reduc",
  "augment", "increas", "integr", "migr", "test", "encadr", "coordon", "elabor", "redig", "modelis", "programm",
  "constru", "built", "build", "lanc", "launch", "assur", "configur", "administr", "securis", "secur", "entrain", "train",
  "publi", "present", "collabor", "design", "led", "lead", "improv", "deliver", "livr", "architect", "wrote", "writ",
  "manag", "ship", "refactor", "mentor", "achiev", "research", "recherch", "benchmark", "prototyp", "fonde", "found",
  "etabl", "establish", "accelere", "accelerat", "simplifi", "evalu", "mesur", "measur", "detect", "conduct", "condui",
];

const startsWithAction = (line: string) => {
  const f = fold(stripBullet(line)).replace(/^[^a-z]+/, "");
  return ACTION_STEMS.some((s) => f.startsWith(s));
};

const YEAR_G = /\b(?:19|20)\d{2}\b/g;
/** A number that is not just a year (12 users, 30 %, x3, 2.5k). */
export const hasMetric = (s: string) => /\d/.test(s.replace(YEAR_G, "").replace(/\b\d{1,2}\/\d{2,4}\b/g, ""));

const FIRST_PERSON = /\b(?:[Jj]e|[Mm]on|[Mm]a|[Mm]es|[Mm]oi|[Mm]y|[Mm]e|[Mm]yself|I(?![/\d]))\b|\b[Jj]['’]/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+?216[\s.-]?)?\b\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b|\+\d[\d\s.-]{7,}\d/;
const LINKS = /linkedin\.com|github\.com|gitlab\.com|https?:\/\//i;

const MONTHS = "jan|janv|janvier|january|feb|fev|fevr|fevrier|february|mar|mars|march|apr|avr|avril|april|may|mai|jun|juin|june|jul|juil|juillet|july|aug|aou|aout|august|sep|sept|septembre|september|oct|octobre|october|nov|novembre|november|dec|decembre|december";
const RANGE = new RegExp(
  `((?:\\b(?:${MONTHS})\\.?\\s+|\\b\\d{1,2}/)?((?:19|20)\\d{2}))\\s*(?:-|–|—|à|to|au|->)\\s*((?:\\b(?:${MONTHS})\\.?\\s+|\\b\\d{1,2}/)?((?:19|20)\\d{2}))`,
  "gi",
);

export function cvHealth(text: string): HealthReport {
  const src = (text ?? "").replace(/\r\n?/g, "\n");
  const words = wordCount(src.replace(/[#*_`>]/g, " "));
  const lines = src.split("\n").map((l) => l.trim()).filter(Boolean);
  const findings: Finding[] = [];
  const passed: HealthId[] = [];
  const check = (id: HealthId, fail: boolean, severity: Severity, extra: Omit<Finding, "id" | "severity"> = {}) => {
    if (fail) findings.push({ id, severity, ...extra });
    else passed.push(id);
  };

  if (!src.trim()) {
    return { score: 0, findings: [{ id: "empty", severity: "high" }], passed, stats: { words: 0, bullets: 0, actionBullets: 0, quantified: 0, sections: [] } };
  }

  // Sections
  const sections = [...new Set(lines.filter((l) => l.length <= 50).map(headingKey).filter((k): k is SectionKey => !!k))];
  const has = (k: SectionKey) => sections.includes(k);
  check("noEducation", !has("education"), "high");
  check("noExperience", !has("experience") && !has("projects"), "high");
  check("noSkills", !has("skills"), "medium");
  check("noLanguages", !has("languages"), "low");

  // Contact
  check("noEmail", !EMAIL.test(src), "high");
  check("noPhone", !PHONE.test(src.replace(YEAR_G, "")), "medium");
  check("noLinks", !LINKS.test(src), "low");

  // Length (≈450 words per page)
  check("tooShort", words < 150, "medium", { n: words });
  check("tooLong", words > 900, "medium", { n: words });

  // Bullets
  const bullets = lines.filter(isBullet).map(stripBullet).filter((b) => b.length > 0);
  const content = bullets.filter((b) => wordCount(b) >= 4); // ignore skill lists like "- Python, Java"
  const actionBullets = content.filter(startsWithAction).length;
  const quantified = content.filter(hasMetric).length;
  check("fewActionVerbs", content.length >= 3 && actionBullets / content.length < 0.5, "medium", { n: Math.round((actionBullets / Math.max(1, content.length)) * 100) });
  check("fewNumbers", content.length > 0 ? quantified < Math.min(3, content.length) : words >= 150, "medium", { n: quantified });
  const long = bullets.filter((b) => wordCount(b) > 30);
  check("longBullets", long.length > 0, "low", { n: long.length, sample: long[0]?.slice(0, 80) });

  // Voice
  const fp = src.replace(/^#.*$/gm, "").match(FIRST_PERSON) ?? [];
  check("firstPerson", fp.length >= 2, "low", { n: fp.length });

  // Dates
  const folded = fold(src);
  let badOrder = "";
  const styles = new Set<string>();
  for (const m of folded.matchAll(RANGE)) {
    if (Number(m[2]) > Number(m[4]) && !badOrder) badOrder = m[0];
    for (const part of [m[1], m[3]]) styles.add(/\//.test(part) ? "numeric" : /[a-z]/.test(part) ? "month" : "year");
  }
  check("dateOrder", !!badOrder, "high", { sample: badOrder });
  check("dateFormats", styles.has("numeric") && styles.has("month"), "low");

  const weight = { high: 18, medium: 9, low: 4 } as const;
  const score = Math.max(0, Math.min(100, 100 - findings.reduce((a, f) => a + weight[f.severity], 0)));
  const order = { high: 0, medium: 1, low: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { score, findings, passed, stats: { words, bullets: bullets.length, actionBullets, quantified, sections } };
}
