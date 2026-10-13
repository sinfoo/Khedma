// What we understand about the candidate from the CV + profile. Pure and deterministic:
// FR/EN keyword maps first; an optional AI pass (src/lib/ai/discover.ts) may only re-label.
import type { JobType, Profile } from "../types";
import { extractSkills } from "../ai/heuristic";
import { fold, tokenize } from "./similarity";

export const FIELDS = [
  "software",
  "web",
  "mobile",
  "data",
  "embedded",
  "networks",
  "devops",
  "telecom",
  "electrical",
  "mechanical",
  "industrial",
  "civil",
  "business",
] as const;
export type Field = (typeof FIELDS)[number];

export const LEVELS = ["year1", "year2", "year3", "graduate"] as const;
export type Level = (typeof LEVELS)[number];

export type SkillLevel = "beginner" | "intermediate" | "advanced";

export interface Insight {
  key: string;
  vars?: Record<string, string | number>;
  /** Free text written by an AI engine (optional). */
  text?: string;
}

export interface CandidateModel {
  field: Field;
  /** Second-best field when the CV straddles two tracks (e.g. web + mobile). */
  altField: Field | null;
  fieldScores: Record<Field, number>;
  level: Level;
  /** Months of internship / work experience found in the CV. */
  seniorityMonths: number;
  skills: { name: string; level: SkillLevel; mentions: number }[];
  languages: { name: string; level: string | null }[];
  locations: string[];
  remoteOk: boolean;
  interests: string[];
  strengths: Insight[];
  weaknesses: Insight[];
  /** Job types that fit the level, best first. */
  preferredTypes: JobType[];
  /** Which engine produced the labels: "heuristic" or an AI label. */
  engine: string;
  /** Input hash, used for cache invalidation. */
  hash: string;
  /** User override of field/level, if any. */
  override: { field?: Field; level?: Level } | null;
}

// Weighted FR/EN cues per field. Matched against the folded CV text (token-boundary regex).
const FIELD_CUES: Record<Field, [string, number][]> = {
  software: [
    ["java", 2], ["spring", 2], ["c\\+\\+", 2], ["c#", 2], ["\\.net", 2], ["python", 1], ["genie logiciel", 3], ["software engineer", 3],
    ["backend", 2], ["back-end", 2], ["microservices", 2], ["api", 1], ["design patterns", 2], ["uml", 1], ["sql", 1], ["git", 0.5],
    ["developpeur", 1], ["developer", 1], ["algorithm", 1], ["algorithme", 1], ["poo", 1], ["oop", 1],
  ],
  web: [
    ["react", 3], ["angular", 3], ["vue", 3], ["next\\.?js", 3], ["html", 2], ["css", 2], ["javascript", 2], ["typescript", 2], ["tailwind", 2],
    ["frontend", 3], ["front-end", 3], ["full-?stack", 3], ["node\\.?js", 2], ["laravel", 2], ["symfony", 2], ["php", 2], ["django", 1],
    ["web", 1], ["site web", 2], ["application web", 2], ["ux", 1], ["figma", 1], ["wordpress", 2],
  ],
  mobile: [
    ["flutter", 4], ["react native", 4], ["android", 3], ["ios", 3], ["kotlin", 3], ["swift", 3], ["swiftui", 3], ["jetpack compose", 3],
    ["application mobile", 3], ["mobile app", 3], ["dart", 2], ["xamarin", 2], ["ionic", 2], ["mobile", 1],
  ],
  data: [
    ["machine learning", 4], ["deep learning", 4], ["data science", 4], ["data scientist", 4], ["data engineer", 4], ["pytorch", 3],
    ["tensorflow", 3], ["scikit-learn", 3], ["sklearn", 3], ["pandas", 2], ["numpy", 2], ["nlp", 3], ["computer vision", 3], ["llm", 3],
    ["intelligence artificielle", 3], ["artificial intelligence", 3], ["apprentissage automatique", 4], ["big data", 3], ["spark", 2],
    ["power bi", 2], ["tableau", 1], ["statistiques", 2], ["statistics", 2], ["analyse de donnees", 3], ["data analysis", 3], ["kaggle", 2],
    ["etl", 2], ["airflow", 2], ["jupyter", 1], ["\\bia\\b", 1], ["\\bai\\b", 1], ["donnees", 1], ["data", 1],
  ],
  embedded: [
    ["embarque", 4], ["embedded", 4], ["stm32", 4], ["arduino", 3], ["raspberry", 2], ["rtos", 3], ["freertos", 3], ["microcontrol", 3],
    ["fpga", 3], ["vhdl", 3], ["verilog", 3], ["iot", 3], ["firmware", 3], ["\\bcan\\b", 1], ["i2c", 2], ["spi", 2], ["uart", 2], ["pcb", 2],
    ["robotique", 2], ["robotics", 2], ["ros", 2], ["capteur", 2], ["sensor", 2], ["automatique", 1], ["systemes embarques", 4],
  ],
  networks: [
    ["cybersecurite", 4], ["cybersecurity", 4], ["securite informatique", 4], ["pentest", 4], ["penetration", 3], ["cryptograph", 3],
    ["reseaux", 2], ["network", 2], ["cisco", 3], ["ccna", 4], ["tcp/ip", 3], ["firewall", 3], ["pare-feu", 3], ["vpn", 2], ["wireshark", 3],
    ["siem", 3], ["soc", 2], ["ospf", 3], ["bgp", 3], ["active directory", 2], ["vmware", 2], ["linux", 1], ["admin", 1],
  ],
  devops: [
    ["devops", 4], ["kubernetes", 4], ["k8s", 4], ["docker", 3], ["terraform", 4], ["ansible", 3], ["jenkins", 3], ["ci/cd", 3], ["gitlab ci", 3],
    ["github actions", 3], ["aws", 2], ["azure", 2], ["gcp", 2], ["cloud", 2], ["sre", 3], ["prometheus", 3], ["grafana", 3], ["helm", 3],
    ["nginx", 2], ["infrastructure", 2], ["deploiement", 1], ["deployment", 1],
  ],
  telecom: [
    ["telecom", 4], ["telecommunication", 4], ["5g", 3], ["lte", 3], ["4g", 2], ["radio", 2], ["antenne", 3], ["antenna", 3], ["rf", 2],
    ["traitement du signal", 3], ["signal processing", 3], ["voip", 3], ["fibre optique", 3], ["optical", 2], ["sdn", 2], ["gsm", 2],
    ["modulation", 3], ["ofdm", 3], ["matlab", 1], ["transmission", 2],
  ],
  electrical: [
    ["genie electrique", 4], ["electrical engineering", 4], ["electronique", 3], ["electronics", 3], ["electrotechnique", 4],
    ["puissance", 2], ["power electronics", 3], ["electronique de puissance", 4], ["haute tension", 3], ["high voltage", 3],
    ["energie", 2], ["energy", 2], ["photovolta", 3], ["solar", 2], ["solaire", 2], ["moteur", 1], ["motor", 1], ["plc", 2], ["automate", 2],
    ["simulink", 2], ["circuit", 2], ["steg", 2], ["smart grid", 3], ["reseau electrique", 3],
  ],
  mechanical: [
    ["genie mecanique", 4], ["mechanical engineering", 4], ["mecanique", 3], ["mechanical", 3], ["solidworks", 4], ["catia", 4], ["autocad", 2],
    ["cao", 2], ["cad", 2], ["conception mecanique", 4], ["thermodynamique", 3], ["thermodynamics", 3], ["fluide", 2], ["fluid", 2],
    ["resistance des materiaux", 3], ["fem", 2], ["ansys", 3], ["abaqus", 3], ["usinage", 3], ["machining", 3], ["mecatronique", 3],
    ["mechatronics", 3], ["hydraulique", 2], ["pneumatique", 2],
  ],
  industrial: [
    ["genie industriel", 4], ["industrial engineering", 4], ["lean", 3], ["six sigma", 3], ["supply chain", 3], ["logistique", 3], ["logistics", 3],
    ["production", 2], ["qualite", 2], ["quality", 2], ["maintenance", 2], ["amelioration continue", 3], ["continuous improvement", 3],
    ["kaizen", 3], ["5s", 2], ["ordonnancement", 3], ["scheduling", 2], ["recherche operationnelle", 3], ["operations research", 3],
    ["erp", 2], ["sap", 2], ["usine", 2], ["plant", 1], ["industrie 4", 3], ["industry 4", 3],
  ],
  civil: [
    ["genie civil", 4], ["civil engineering", 4], ["beton", 3], ["concrete", 3], ["structure", 2], ["structures", 2], ["batiment", 3], ["building", 1],
    ["btp", 3], ["chantier", 3], ["construction site", 3], ["geotechnique", 3], ["geotechnical", 3], ["hydraulique urbaine", 3],
    ["pont", 2], ["bridge", 2], ["robot structural", 3], ["autocad", 1], ["revit", 3], ["etabs", 3], ["topographie", 2],
  ],
  business: [
    ["business analyst", 4], ["business intelligence", 3], ["gestion de projet", 2], ["project management", 2], ["product owner", 3],
    ["product manager", 3], ["marketing", 3], ["finance", 3], ["comptabilite", 3], ["accounting", 3], ["audit", 3], ["consulting", 3],
    ["conseil", 2], ["erp", 2], ["sap", 2], ["odoo", 2], ["crm", 2], ["entrepreneur", 2], ["business plan", 3], ["commercial", 2],
    ["management", 1], ["mba", 3], ["scrum master", 2],
  ],
};

const FIELD_RE: Record<Field, { re: RegExp; w: number }[]> = Object.fromEntries(
  FIELDS.map((f) => [
    f,
    FIELD_CUES[f].map(([cue, w]) => ({
      re: new RegExp(cue.startsWith("\\b") ? cue : `(?<![a-z0-9])${cue}(?![a-z0-9])`, "g"),
      w,
    })),
  ]),
) as Record<Field, { re: RegExp; w: number }[]>;

/** Score every field on a folded text; counts are sub-linear so one stuffed keyword does not dominate. */
export function scoreFields(text: string): Record<Field, number> {
  const t = fold(text);
  const out = {} as Record<Field, number>;
  for (const f of FIELDS) {
    let s = 0;
    for (const { re, w } of FIELD_RE[f]) {
      const n = (t.match(re) ?? []).length;
      if (n) s += w * (1 + Math.log(n));
    }
    out[f] = Math.round(s * 10) / 10;
  }
  return out;
}

/** Best field of a text (job posting or CV), or null when nothing recognisable. */
export function detectField(text: string): { field: Field; alt: Field | null; scores: Record<Field, number> } | null {
  const scores = scoreFields(text);
  const ranked = FIELDS.slice().sort((a, b) => scores[b] - scores[a]);
  if (scores[ranked[0]] <= 0) return null;
  const alt = scores[ranked[1]] >= Math.max(2, scores[ranked[0]] * 0.6) ? ranked[1] : null;
  return { field: ranked[0], alt, scores };
}

const LEVEL_CUES: [Level, RegExp][] = [
  ["graduate", /\b(jeune diplome|diplome d'?ingenieur|ingenieur diplome|diplome en 20\d\d|graduated|graduate engineer|recently graduated|fresh graduate|ingenieur junior|junior engineer)\b/],
  ["year3", /\b(3(?:e|eme|ieme)?\s*annee|troisieme annee|3rd year|third year|final year|derniere annee|pfe|projet de fin d'?etudes?|final[- ]year project|graduation project|stage de fin d'?etudes?)\b/],
  ["year2", /\b(2(?:e|eme|ieme)?\s*annee|deuxieme annee|2nd year|second year|stage d'?ingenieur|stage ingenieur|engineering internship)\b/],
  ["year1", /\b(1(?:e|er|re|ere)?\s*annee|premiere annee|1st year|first year|stage d'?ete|stage ouvrier|summer internship|stage d'?initiation|stage technicien)\b/],
];

/** Level from CV text + the profile's declared year. Declared year wins when present. */
export function detectLevel(cvText: string, declared = ""): Level {
  const d = fold(declared);
  const byDeclared = LEVEL_CUES.find(([, re]) => re.test(d))?.[0];
  if (byDeclared) return byDeclared;
  const dm = d.match(/\b([123])\b/);
  if (dm) return (["year1", "year2", "year3"] as Level[])[Number(dm[1]) - 1];
  const t = fold(cvText);
  // A fresh CV usually mentions its current year; count all cues and take the strongest.
  const counts = LEVEL_CUES.map(([lvl, re]) => ({ lvl, n: (t.match(new RegExp(re.source, "g")) ?? []).length }));
  const best = counts.filter((c) => c.n).sort((a, b) => b.n - a.n)[0];
  return best?.lvl ?? "year2";
}

const LEVEL_TYPES: Record<Level, JobType[]> = {
  year1: ["stage"],
  year2: ["stage", "alternance"],
  year3: ["pfe", "stage", "emploi"],
  graduate: ["emploi", "pfe", "freelance"],
};

const MONTH_RE = /\b(\d{1,2})\s*(mois|months?)\b/g;
const MONTHS = "janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
const MONTH_INDEX: Record<string, number> = {};
for (const [i, names] of [
  ["janvier", "jan", "january"], ["fevrier", "feb", "february"], ["mars", "mar", "march"], ["avril", "apr", "april"], ["mai", "may"],
  ["juin", "jun", "june"], ["juillet", "jul", "july"], ["aout", "aug", "august"], ["septembre", "sep", "sept", "september"],
  ["octobre", "oct", "october"], ["novembre", "nov", "november"], ["decembre", "dec", "december"],
].entries())
  for (const n of names) MONTH_INDEX[n] = i;
const RANGE_RE = new RegExp(`\\b(${MONTHS})\\.?\\s+(20\\d\\d)\\s*(?:-|–|—|a|to|au|jusqu'?a)\\s*(${MONTHS})\\.?\\s+(20\\d\\d)\\b`, "g");

/** Months of experience: explicit "3 mois" durations plus "juin 2025 – août 2025" ranges, capped at 60. */
export function detectSeniorityMonths(cvText: string): number {
  const t = fold(cvText);
  let months = 0;
  for (const m of t.matchAll(MONTH_RE)) months += Math.min(24, Number(m[1]));
  for (const m of t.matchAll(RANGE_RE)) {
    const a = Number(m[2]) * 12 + (MONTH_INDEX[m[1]] ?? 0);
    const b = Number(m[4]) * 12 + (MONTH_INDEX[m[3]] ?? 0);
    if (b >= a) months += Math.min(24, b - a + 1);
  }
  return Math.min(60, months);
}

const LANG_RE: [string, RegExp][] = [
  ["Français", /\b(francais|french)\b/],
  ["Anglais", /\b(anglais|english)\b/],
  ["Arabe", /\b(arabe|arabic)\b/],
  ["Allemand", /\b(allemand|german|deutsch)\b/],
  ["Espagnol", /\b(espagnol|spanish)\b/],
  ["Italien", /\b(italien|italian)\b/],
];
const CEFR_RE = /\b(a1|a2|b1|b2|c1|c2)\b|\b(natif|native|langue maternelle|bilingue|bilingual|courant|fluent|intermediaire|intermediate|debutant|beginner|toeic\s*\d{3}|ielts\s*\d(\.\d)?|tcf|delf|dalf)\b/;

export function detectLanguages(cvText: string, declared: { name: string; level: string | null }[]): { name: string; level: string | null }[] {
  const out = new Map<string, string | null>();
  for (const d of declared) if (d.name.trim()) out.set(d.name.trim(), d.level);
  const t = fold(cvText);
  for (const [name, re] of LANG_RE) {
    const m = re.exec(t);
    if (!m) continue;
    const key = [...out.keys()].find((k) => fold(k) === fold(name) || re.test(fold(k)));
    if (key && out.get(key)) continue;
    // Level cue within the same line / 40 chars after the language name.
    const tail = t.slice(m.index, m.index + 60).split("\n")[0];
    const lvl = CEFR_RE.exec(tail)?.[0]?.toUpperCase() ?? null;
    out.set(key ?? name, lvl);
  }
  return [...out.entries()].map(([name, level]) => ({ name, level }));
}

// Tunisian governorates / cities + a few abroad hubs students target.
const CITIES = [
  "Tunis", "Ariana", "Ben Arous", "Manouba", "La Marsa", "Lac", "Sousse", "Sfax", "Monastir", "Nabeul", "Bizerte", "Gabès", "Gafsa", "Kairouan",
  "Mahdia", "Médenine", "Tozeur", "Kébili", "Béja", "Jendouba", "Le Kef", "Siliana", "Zaghouan", "Tataouine", "Sidi Bouzid", "Kasserine",
  "Paris", "Lyon", "Toulouse", "Berlin", "Munich", "Montréal", "Dubai",
];

export function detectLocations(text: string, declared: string[]): { locations: string[]; remoteOk: boolean } {
  const t = fold(text);
  const found = new Set(declared.map((d) => d.trim()).filter(Boolean));
  for (const c of CITIES) if (new RegExp(`(?<![a-z])${fold(c)}(?![a-z])`).test(t)) found.add(c);
  const remoteOk = /\b(remote|teletravail|a distance|hybride|hybrid)\b/.test(t) || [...found].some((f) => /remote/i.test(f));
  return { locations: [...found].filter((f) => !/remote/i.test(f)).slice(0, 8), remoteOk };
}

const INTEREST_CUES: [string, RegExp][] = [
  ["open source", /\b(open[- ]source|github|contribut)\b/],
  ["IA générative", /\b(llm|genai|generative|ia generative|chatgpt|rag|langchain)\b/],
  ["cloud", /\b(cloud|aws|azure|gcp)\b/],
  ["robotique", /\b(robot|ros|drone)\b/],
  ["jeux vidéo", /\b(game|jeu video|jeux video|unity|unreal)\b/],
  ["fintech", /\b(fintech|banque|bank|paiement|payment|trading)\b/],
  ["santé", /\b(sante|health|medical|hopital|hospital)\b/],
  ["énergie", /\b(energie|energy|photovolta|solaire|eolien)\b/],
  ["automobile", /\b(automobile|automotive|vehicule|vehicle|autosar)\b/],
  ["blockchain", /\b(blockchain|solidity|web3|crypto)\b/],
  ["UX / design", /\b(ux|ui design|figma|design thinking)\b/],
  ["entrepreneuriat", /\b(startup|start-up|entrepreneur|hackathon|incubat)\b/],
  ["associatif", /\b(association|club|benevol|volunteer|ieee|enactus|junior entreprise)\b/],
  ["recherche", /\b(recherche|research|publication|paper|laboratoire|lab\b)\b/],
];

export function detectInterests(text: string): string[] {
  const t = fold(text);
  return INTEREST_CUES.filter(([, re]) => re.test(t)).map(([k]) => k).slice(0, 6);
}

export function skillLevels(cvText: string, declared: string[], declaredLevels: Record<string, SkillLevel>, headline: string) {
  const text = `${declared.join(", ")}\n${cvText}`;
  const names = [...new Set([...extractSkills(text), ...declared.map((d) => d.trim()).filter(Boolean)])];
  const lc = fold(cvText);
  const head = fold(headline);
  return names
    .map((name) => {
      const re = new RegExp(`(?<![a-z0-9+#.])${fold(name).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![a-z0-9+#])`, "g");
      const mentions = (lc.match(re) ?? []).length;
      const given = declaredLevels[name] ?? declaredLevels[Object.keys(declaredLevels).find((k) => fold(k) === fold(name)) ?? ""];
      const level: SkillLevel = given ?? (mentions >= 4 || re.test(head) ? "advanced" : mentions >= 2 ? "intermediate" : "beginner");
      return { name, level, mentions };
    })
    .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name))
    .slice(0, 60);
}

/** Tiny deterministic hash (djb2) for cache keys. */
export function hashInputs(parts: unknown[]): string {
  const s = JSON.stringify(parts);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export interface ModelInput {
  cvText: string;
  profile: Pick<Profile, "headline" | "skills" | "target_roles" | "target_locations" | "target_types" | "languages">;
  extra?: { level?: string; specialty?: string; city?: string; skill_levels?: Record<string, SkillLevel>; langs?: { name: string; level: string }[]; links?: { github?: string; linkedin?: string; portfolio?: string } };
  override?: { field?: Field; level?: Level } | null;
}

export function buildCandidateModel(input: ModelInput): CandidateModel {
  const { cvText, profile } = input;
  const extra = input.extra ?? {};
  const all = `${profile.headline}\n${extra.specialty ?? ""}\n${profile.skills.join(", ")}\n${profile.target_roles.join(", ")}\n${cvText}`;

  // Field: CV + headline + specialty, with the specialty counted twice (it is the official track).
  const fieldText = `${all}\n${extra.specialty ?? ""}\n${profile.headline}`;
  const det = detectField(fieldText);
  const fieldScores = det?.scores ?? scoreFields("");
  const override = input.override && (input.override.field || input.override.level) ? input.override : null;
  const field = override?.field ?? det?.field ?? "software";
  const altField = det && det.alt !== field ? det.alt : null;
  const level = override?.level ?? detectLevel(cvText, extra.level ?? "");

  const skills = skillLevels(cvText, profile.skills, extra.skill_levels ?? {}, profile.headline);
  const languages = detectLanguages(cvText, [
    ...(extra.langs ?? []).map((l) => ({ name: l.name, level: l.level })),
    ...profile.languages.filter((l) => !(extra.langs ?? []).some((x) => fold(x.name) === fold(l))).map((l) => ({ name: l, level: null })),
  ]);
  const { locations, remoteOk } = detectLocations(`${cvText}\n${profile.target_locations.join(" ")}`, [...profile.target_locations, extra.city ?? ""]);
  const interests = detectInterests(all);
  const seniorityMonths = detectSeniorityMonths(cvText);

  // Strengths / weaknesses: facts about the CV, never invented.
  const strengths: Insight[] = [];
  const weaknesses: Insight[] = [];
  const words = tokenize(cvText).length;
  const quantified = (cvText.match(/\b\d+\s?(%|k\b|ms\b|utilisateurs|users|clients|lignes|lines|x\b)/gi) ?? []).length;
  const projects = (cvText.match(/^#{2,3}\s|^[-*]\s+\*\*/gm) ?? []).length;
  const links = extra.links ?? {};
  if (skills.length >= 8) strengths.push({ key: "manySkills", vars: { n: skills.length } });
  if (skills.filter((s) => s.level === "advanced").length >= 2) strengths.push({ key: "deepSkills", vars: { list: skills.filter((s) => s.level === "advanced").slice(0, 3).map((s) => s.name).join(", ") } });
  if (seniorityMonths >= 2) strengths.push({ key: "experience", vars: { n: seniorityMonths } });
  if (languages.length >= 3) strengths.push({ key: "languages", vars: { n: languages.length } });
  if (quantified >= 2) strengths.push({ key: "quantified", vars: { n: quantified } });
  if (links.github) strengths.push({ key: "github" });
  if (interests.includes("associatif")) strengths.push({ key: "extracurricular" });

  if (!cvText.trim()) weaknesses.push({ key: "noCv" });
  else if (words < 120) weaknesses.push({ key: "shortCv", vars: { n: words } });
  if (cvText.trim() && quantified === 0) weaknesses.push({ key: "noQuantified" });
  if (skills.length < 5) weaknesses.push({ key: "fewSkills", vars: { n: skills.length } });
  if (cvText.trim() && projects < 2) weaknesses.push({ key: "fewProjects" });
  if (!links.github && !links.portfolio) weaknesses.push({ key: "noLinks" });
  if (!profile.target_roles.length) weaknesses.push({ key: "noTargets" });
  if (!languages.some((l) => /anglais|english/i.test(l.name))) weaknesses.push({ key: "noEnglish" });

  return {
    field,
    altField,
    fieldScores,
    level,
    seniorityMonths,
    skills,
    languages,
    locations,
    remoteOk,
    interests,
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    preferredTypes: LEVEL_TYPES[level],
    engine: "heuristic",
    hash: hashInputs([cvText, profile, extra, override]),
    override,
  };
}

export const typesForLevel = (level: Level) => LEVEL_TYPES[level];
