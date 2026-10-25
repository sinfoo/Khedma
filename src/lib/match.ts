// Deterministic CV match breakdown (after freehire's skill match, MIT): three explainable checks shown next to
// the AI score. A check with nothing to compare is listed as skipped instead of scoring 0.
import type { Job, Profile } from "./types";
import { extractSkills } from "./ai/heuristic";
import { fold } from "./sources/classify";
import { INTERN_TITLE, JUNIOR, SENIOR_NEGATIVES, YEARS_BODY, YEARS_TITLE, compileKeyword, compilePositives, titleMatch } from "./search/filter";
import type { Level } from "./search/prefs";

export type JobLevel = "intern" | "junior" | "senior";
export type MatchLine =
  | { kind: "skills"; ratio: number; found: string[]; missing: string[]; /** Missing skills the posting names only as nice to have. */ optional: string[] }
  | { kind: "title"; ratio: number; role: string }
  | { kind: "seniority"; ratio: number; level: JobLevel };
export type MatchKind = MatchLine["kind"];
export interface MatchBreakdown {
  lines: MatchLine[];
  /** Checks left out because one side is unknown (no skills listed, no target role, no level wording). */
  skipped: MatchKind[];
  /** Mean of the available checks, 0-100; null when none applies. */
  pct: number | null;
}

const SENIOR = SENIOR_NEGATIVES.map(compileKeyword);
const INTERN_TYPES: Job["type"][] = ["stage", "pfe", "alternance"];

// Optional-section masking (after freehire's reqextract MaskPreferred, MIT). Words are blanked, not deleted, so
// sentence and line boundaries stay where the posting put them. Only another recognised heading closes a section:
// an unclosed one masks the rest, which understates requirements rather than inventing them.
const PREF_HEAD = /^(nice (to haves?|if you have)|good to have|preferred|bonus( points)?|desirable|desired|pluses|(it )?would be a plus|a plus|atouts?|(un|les) plus|(serait|est) un plus|souhaite(e|s|es)?|souhaitables?|(competences|connaissances|qualifications) (souhaitees|appreciees|optionnelles)|optionnel(le)?s?)( (skills?|qualifications?|points|competences|connaissances|requirements?))?$/;
const END_HEAD = /^(requirements?|required|must haves?|qualifications?|what you ?ll need|responsibilities|your role|exigences|prerequis|profil|competences|missions?|vos missions|responsabilites|le poste|benefits|perks|what we offer|about (us|the (role|company|team))|how to apply|salary|compensation|nous offrons|ce que nous offrons|avantages|pourquoi nous rejoindre|a propos)\b/;
// ponytail: inline markers blank the whole sentence, so "Python requis, Docker serait un plus" also makes Python
// optional; split on clauses if that shows up in real postings.
const PREF_INLINE = /\b(nice to have|good to have|(is|are|would be|a) plus|preferred|bonus|desirable|un plus|atouts?|souhaite(e|s|es)?|souhaitables?|apprecie(e|s|es)?|optionnel(le)?s?)\b/;
const blank = (s: string) => s.replace(/[\p{L}\p{N}]/gu, " ");
const words = (s: string) => fold(s).replace(/[^a-z0-9]+/g, " ").trim();

/** Blanks the words in "nice to have / serait un plus / atout" sections and sentences of a plain-text description. */
export function maskPreferred(text: string): string {
  let open = false;
  return text
    .split("\n")
    .map((line) => {
      const h = words(line);
      if (h && line.trim().length <= 60) {
        if (PREF_HEAD.test(h)) return (open = true), blank(line);
        if (END_HEAD.test(h)) return (open = false), line;
      }
      if (open) return blank(line);
      // "Profil souhaité" heads the required profile, not an optional one.
      return line.replace(/[^.;!?]+[.;!?]?/g, (s) => (PREF_INLINE.test(fold(s)) && !/profil (souhaite|recherche)/.test(fold(s)) ? blank(s) : s));
    })
    .join("\n");
}

export function jobLevel(job: Pick<Job, "title" | "type" | "description">): JobLevel | null {
  const title = fold(job.title);
  if (INTERN_TYPES.includes(job.type) || INTERN_TITLE.test(title)) return "intern";
  if (SENIOR.some((m) => m(title)) || YEARS_TITLE.test(title) || YEARS_BODY.test(fold(job.description).slice(0, 6000))) return "senior";
  if (JUNIOR.test(title)) return "junior";
  return null;
}

export function matchBreakdown(job: Pick<Job, "title" | "type" | "description" | "tags">, profile: Pick<Profile, "target_roles">, cvText: string, levels: Level[]): MatchBreakdown {
  const lines: MatchLine[] = [];
  const skipped: MatchKind[] = [];

  const head = `${job.title}\n${job.tags.join(", ")}\n`;
  const skills = extractSkills(head + job.description);
  if (skills.length && cvText.trim()) {
    const have = new Set(extractSkills(cvText).map((s) => s.toLowerCase()));
    // Extracted skills only: a substring test credited Java, SQL and Git to a CV listing JavaScript, NoSQL and GitHub.
    const inCv = (s: string) => have.has(s.toLowerCase());
    // Skills seen only in optional sections do not count; when nothing is left, the masking is not trusted.
    const req = new Set(extractSkills(head + maskPreferred(job.description)));
    const required = req.size ? skills.filter((s) => req.has(s)) : skills;
    const found = required.filter(inCv);
    const optional = skills.filter((s) => !required.includes(s) && !inCv(s));
    lines.push({ kind: "skills", ratio: found.length / required.length, found, missing: required.filter((s) => !found.includes(s)), optional });
  } else skipped.push("skills");

  // Roles such as "stage" alone say nothing about the job itself, so they do not count as a target.
  const roles = profile.target_roles.map((r) => r.trim()).filter((r) => compilePositives([r]).some((p) => p.matcher || p.tokens.length));
  if (roles.length) {
    const best = roles.map((role) => ({ role, ratio: titleMatch(job.title, compilePositives([role]))?.score ?? 0 })).sort((a, b) => b.ratio - a.ratio)[0];
    lines.push({ kind: "title", ...best });
  } else skipped.push("title");

  const level = jobLevel(job);
  if (level) {
    const fits = level === "intern" ? levels.includes("intern") : level === "junior" ? levels.some((l) => l !== "intern") : levels.includes("mid") ? 0.5 : 0;
    lines.push({ kind: "seniority", ratio: Number(fits), level });
  } else skipped.push("seniority");

  const pct = lines.length ? Math.round((lines.reduce((s, l) => s + l.ratio, 0) / lines.length) * 100) : null;
  return { lines, skipped, pct };
}
