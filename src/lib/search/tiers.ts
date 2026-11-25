// Tiered queries for boards that search by keyword: the user's own terms first, FR/EN synonyms and
// adjacent titles when a board answers thinly, broad contract words as a last resort. Pure.
import { fold } from "./filter";

export type Tier = 1 | 2 | 3;
export type Tiers = Record<Tier, string[]> & {
  /** What "the board answered enough" counts before the next tier: offers listed (default) or offers that passed the filter. */
  gate?: "total" | "matched";
};

// Adjacent titles per role head word (folded). Both languages, because Tunisian boards mix them.
const ADJACENT: Record<string, string[]> = {
  dev: ["developer", "développeur", "software engineer", "ingénieur logiciel"],
  developer: ["développeur", "software engineer"],
  developpeur: ["developer", "ingénieur logiciel"],
  "full stack": ["fullstack", "web developer"],
  fullstack: ["full stack", "développeur web"],
  backend: ["back-end", "développeur backend", "api"],
  frontend: ["front-end", "développeur frontend", "react"],
  web: ["développeur web", "web developer"],
  mobile: ["android", "ios", "flutter", "développeur mobile"],
  data: ["data scientist", "data analyst", "data engineer", "données"],
  ml: ["machine learning", "intelligence artificielle", "ai engineer"],
  "machine learning": ["ml engineer", "deep learning", "intelligence artificielle"],
  ia: ["intelligence artificielle", "machine learning", "ai"],
  ai: ["machine learning", "ia", "intelligence artificielle"],
  devops: ["cloud", "sre", "infrastructure", "ci/cd"],
  cloud: ["devops", "aws", "azure"],
  embedded: ["embarqué", "firmware", "iot"],
  embarque: ["embedded", "firmware", "systèmes embarqués"],
  reseau: ["network", "réseaux", "télécom"],
  network: ["réseaux", "telecom", "cisco"],
  securite: ["cybersécurité", "security", "pentest"],
  security: ["cybersecurity", "sécurité", "soc"],
  cybersecurite: ["security", "pentest", "soc"],
  design: ["ui/ux", "product designer", "designer"],
  designer: ["ui/ux", "product design", "figma"],
  ux: ["ui/ux", "product designer", "user experience"],
  ui: ["ui/ux", "designer", "interface"],
  "ui/ux": ["ux designer", "product designer", "figma"],
  qa: ["test", "testeur", "quality"],
  test: ["qa", "testeur", "automation"],
  ingenieur: ["engineer", "ingénieur"],
  engineer: ["ingénieur", "engineering"],
  logiciel: ["software", "développeur"],
  software: ["logiciel", "developer"],
  telecom: ["télécommunications", "réseaux", "5g"],
  electrique: ["electrical", "électronique", "automatisme"],
  mecanique: ["mechanical", "mécanique", "conception"],
  industriel: ["industrial", "production", "lean"],
};
const BROAD = ["stage", "internship", "pfe"];
const INTERN_TYPES = new Set(["stage", "pfe", "alternance"]);

const headOf = (s: string) => fold(s).trim().split(/\s+/)[0] ?? "";

/**
 * `types`: the contract types the search accepts. When they are all internship kinds, a board that lists plenty of
 * jobs for "développeur" but few internships is asked for the internship words next (tier 2), and the wider
 * adjacent titles are skipped: they would bring more jobs, not more internships.
 */
export function buildTiers(keywords: string[], roles: string[], types: string[] = []): Tiers {
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  const t1 = uniq(keywords.length ? keywords : roles.map((r) => headOf(r)).filter((w) => w.length >= 3)).slice(0, 6);
  const used = new Set(t1.map(fold));
  const t2: string[] = [];
  for (const k of [...t1, ...roles]) {
    const f = fold(k);
    for (const key of [f, headOf(k), ...f.split(/\s+/)]) {
      for (const alt of ADJACENT[key] ?? []) if (!used.has(fold(alt))) {
        used.add(fold(alt));
        t2.push(alt);
      }
    }
  }
  const t3 = BROAD.filter((b) => !used.has(b));
  if (types.length && types.every((t) => INTERN_TYPES.has(t))) return { 1: t1, 2: t3, 3: [], gate: "matched" };
  return { 1: t1, 2: t2.slice(0, 6), 3: t3 };
}
