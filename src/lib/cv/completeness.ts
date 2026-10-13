// Profile strength: weighted checklist → 0-100. Pure, client-safe.
import type { LangLevel, ProfileExtra, SkillLevel } from "./model";
import { hasMetric } from "./health";
import { parseCv, sectionizeToMarkdown, wordCount } from "./sectionize";

export type StrengthId =
  | "identity"
  | "headline"
  | "cv"
  | "cvLength"
  | "measurable"
  | "skills"
  | "skillLevels"
  | "languages"
  | "github"
  | "linkedin"
  | "targets";

export interface StrengthItem {
  id: StrengthId;
  done: boolean;
  weight: number;
  href: string; // anchor of the field that fixes it
}

export interface StrengthInput {
  name: string;
  email: string;
  headline: string;
  skills: string[];
  skill_levels: Record<string, SkillLevel>;
  langs: LangLevel[];
  links: ProfileExtra["links"];
  target_roles: string[];
  target_locations: string[];
  target_types: string[];
  cvText: string; // cv_md, or extracted text of the uploaded file
}

export function profileStrength(p: StrengthInput): { score: number; items: StrengthItem[] } {
  const words = wordCount(p.cvText);
  const md = /^#{1,3} /m.test(p.cvText) ? p.cvText : sectionizeToMarkdown(p.cvText);
  const measurable = parseCv(md)
    .sections.filter((s) => s.key === "projects" || s.key === "experience")
    .some((s) => s.body.split("\n").some((l) => !l.startsWith("#") && hasMetric(l)));
  const leveled = p.skills.filter((s) => p.skill_levels[s]).length;

  const items: StrengthItem[] = [
    { id: "identity", weight: 10, href: "#f-name", done: !!p.name.trim() && /\S+@\S+\.\S+/.test(p.email) },
    { id: "headline", weight: 8, href: "#f-headline", done: p.headline.trim().length >= 10 },
    { id: "cv", weight: 15, href: "#cv", done: words >= 150 },
    { id: "cvLength", weight: 7, href: "#cv", done: words >= 150 && words <= 900 },
    { id: "measurable", weight: 10, href: "#cv", done: measurable },
    { id: "skills", weight: 12, href: "#f-skills", done: p.skills.length >= 8 },
    { id: "skillLevels", weight: 5, href: "#f-skills", done: p.skills.length > 0 && leveled * 2 >= p.skills.length },
    { id: "languages", weight: 8, href: "#f-langs", done: p.langs.length >= 2 },
    { id: "github", weight: 8, href: "#f-github", done: !!p.links.github },
    { id: "linkedin", weight: 7, href: "#f-linkedin", done: !!p.links.linkedin },
    { id: "targets", weight: 10, href: "#f-roles", done: p.target_roles.length > 0 && p.target_locations.length > 0 && p.target_types.length > 0 },
  ];
  const score = items.reduce((a, i) => a + (i.done ? i.weight : 0), 0);
  return { score, items };
}
