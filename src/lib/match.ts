// Deterministic CV match breakdown (after freehire's skill match, MIT): three explainable checks shown next to
// the AI score. A check with nothing to compare is listed as skipped instead of scoring 0.
import type { Job, Profile } from "./types";
import { extractSkills } from "./ai/heuristic";
import { fold } from "./sources/classify";
import { INTERN_TITLE, JUNIOR, SENIOR_NEGATIVES, YEARS_BODY, YEARS_TITLE, compileKeyword, compilePositives, titleMatch } from "./search/filter";
import type { Level } from "./search/prefs";

export type JobLevel = "intern" | "junior" | "senior";
export type MatchLine =
  | { kind: "skills"; ratio: number; found: string[]; missing: string[] }
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

  const skills = extractSkills(`${job.title}\n${job.tags.join(", ")}\n${job.description}`);
  if (skills.length && cvText.trim()) {
    const have = new Set(extractSkills(cvText).map((s) => s.toLowerCase()));
    const cv = fold(cvText);
    const found = skills.filter((s) => have.has(s.toLowerCase()) || cv.includes(fold(s)));
    lines.push({ kind: "skills", ratio: found.length / skills.length, found, missing: skills.filter((s) => !found.includes(s)) });
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
