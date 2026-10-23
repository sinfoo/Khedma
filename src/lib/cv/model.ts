// Pure profile/CV model: types, option lists and input sanitizing. Client-safe (no db).

export const SKILL_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "native"] as const;
export type Cefr = (typeof CEFR_LEVELS)[number];

export interface LangLevel {
  name: string;
  level: Cefr;
}

export interface ProfileExtra {
  school: string;
  level: string; // "1re année ingénieur"
  specialty: string; // "Génie informatique"
  phone: string;
  city: string;
  skill_levels: Record<string, SkillLevel>;
  langs: LangLevel[];
  links: { github: string; linkedin: string; portfolio: string };
  availability: { from: string; to: string }; // YYYY-MM-DD or ""
  /** Where the student wants to apply: ISO country codes, Tunisian cities, remote preference. */
  places: { countries: string[]; cities: string[]; remote: "yes" | "only" | "no" };
  onboarding: { step: number; done: boolean };
  /** A past letter or LinkedIn "About" the AI matches in tone (never copies). */
  writing_sample: string;
  /** Procedural rules that override the writing guardrail ("jamais de tutoiement"). */
  house_rules: string;
}

export const ONBOARDING_STEPS = 5;

export const EMPTY_EXTRA: ProfileExtra = {
  school: "ENIT",
  level: "",
  specialty: "",
  phone: "",
  city: "",
  skill_levels: {},
  langs: [],
  links: { github: "", linkedin: "", portfolio: "" },
  availability: { from: "", to: "" },
  places: { countries: ["TN"], cities: [], remote: "yes" },
  onboarding: { step: 1, done: false },
  writing_sample: "",
  house_rules: "",
};

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const url = (v: unknown) => {
  const x = s(v, 300);
  if (!x) return "";
  const withProto = /^https?:\/\//i.test(x) ? x : `https://${x}`;
  try {
    const u = new URL(withProto);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
};

/** Clamp untrusted input (DB JSON or client patch) into a valid ProfileExtra. */
export function normalizeExtra(raw: unknown): ProfileExtra {
  const r = obj(raw);
  const levels: Record<string, SkillLevel> = {};
  for (const [k, v] of Object.entries(obj(r.skill_levels)).slice(0, 200)) {
    if ((SKILL_LEVELS as readonly string[]).includes(v as string) && k.trim()) levels[k.trim().slice(0, 60)] = v as SkillLevel;
  }
  const langs = (Array.isArray(r.langs) ? r.langs : [])
    .map((l) => ({ name: s(obj(l).name, 40), level: obj(l).level as Cefr }))
    .filter((l) => l.name && (CEFR_LEVELS as readonly string[]).includes(l.level))
    .filter((l, i, a) => a.findIndex((x) => x.name.toLowerCase() === l.name.toLowerCase()) === i)
    .slice(0, 12);
  const links = obj(r.links);
  const av = obj(r.availability);
  const ob = obj(r.onboarding);
  const step = Number(ob.step);
  const pl = obj(r.places);
  const codes = (Array.isArray(pl.countries) ? pl.countries : []).map((c) => s(c, 8).toUpperCase()).filter((c) => /^[A-Z]{2}$|^REMOTE$/.test(c)).slice(0, 30);
  const cities = (Array.isArray(pl.cities) ? pl.cities : []).map((c) => s(c, 40)).filter(Boolean).slice(0, 30);
  const remote = pl.remote === "only" || pl.remote === "no" ? pl.remote : "yes";
  return {
    school: r.school === undefined ? EMPTY_EXTRA.school : s(r.school, 120),
    level: s(r.level, 80),
    specialty: s(r.specialty, 120),
    phone: tnPhone(s(r.phone, 40)),
    city: s(r.city, 80),
    skill_levels: levels,
    langs,
    links: { github: url(links.github), linkedin: url(links.linkedin), portfolio: url(links.portfolio) },
    availability: { from: date(av.from), to: date(av.to) },
    places: r.places === undefined ? EMPTY_EXTRA.places : { countries: codes, cities, remote },
    onboarding: {
      step: Number.isFinite(step) ? Math.min(ONBOARDING_STEPS, Math.max(1, Math.round(step))) : 1,
      done: ob.done === true,
    },
    writing_sample: s(r.writing_sample, 4000),
    house_rules: s(r.house_rules, 1500),
  };
}

// ---------- suggestions ----------
export const ROLE_SUGGESTIONS = [
  "Développeur Full-Stack",
  "Développeur Back-End",
  "Développeur Front-End",
  "Développeur Mobile",
  "Ingénieur DevOps",
  "Ingénieur Cloud",
  "Data Scientist",
  "Data Engineer",
  "Ingénieur Machine Learning",
  "Ingénieur Systèmes Embarqués",
  "Ingénieur Cybersécurité",
  "Ingénieur Réseaux",
  "Ingénieur QA / Test",
  "Ingénieur Logiciel",
  "Business Intelligence",
];

export const CITY_SUGGESTIONS = [
  "Tunis",
  "Ariana",
  "Ben Arous",
  "La Marsa",
  "Les Berges du Lac",
  "Sousse",
  "Sfax",
  "Monastir",
  "Nabeul",
  "Bizerte",
  "Remote",
  "France",
  "Allemagne",
  "Canada",
  "Europe",
];

export const LANGUAGE_SUGGESTIONS = ["Arabe", "Français", "Anglais", "Allemand", "Italien", "Espagnol"];

/** Autocomplete list for the skill input (canonical names used by extractSkills). */
export const SKILL_SUGGESTIONS = [
  "Python", "Java", "C", "C++", "C#", "JavaScript", "TypeScript", "PHP", "Kotlin", "Swift", "Dart", "Golang", "Rust", "SQL",
  "HTML", "CSS", "Tailwind", "React", "Next.js", "Angular", "Vue", "Node.js", "Express.js", "NestJS", "Django", "Flask",
  "FastAPI", "Spring Boot", ".NET", "Laravel", "Symfony", "REST API", "GraphQL", "Flutter", "React Native", "Android",
  "MySQL", "PostgreSQL", "MongoDB", "Redis", "Firebase", "Oracle", "Docker", "Kubernetes", "AWS", "Azure", "GCP",
  "Terraform", "Jenkins", "GitHub Actions", "CI/CD", "Linux", "Git", "Jira", "Figma", "Machine Learning", "Deep Learning",
  "NLP", "Computer Vision", "TensorFlow", "PyTorch", "scikit-learn", "Pandas", "NumPy", "Power BI", "Apache Spark",
  "Embedded C", "STM32", "Arduino", "Raspberry Pi", "FreeRTOS", "IoT", "MQTT", "FPGA", "VHDL", "MATLAB", "Networking",
  "Cisco", "Cybersecurity", "Agile", "Scrum", "UML", "OOP", "Design Patterns", "Teamwork", "Communication",
];

/** Merge skill lists case-insensitively, keeping the first spelling. */
export function mergeSkills(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of [...a, ...b]) {
    const k = x.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x.trim());
  }
  return out;
}

/** What the profile editor and the wizard send to the server (any subset). */
export interface ProfileDraft {
  name: string;
  email: string;
  headline: string;
  cv_md: string;
  skills: string[];
  target_roles: string[];
  target_locations: string[];
  target_types: string[];
  extra: Partial<Omit<ProfileExtra, "onboarding">>;
}

/** Headline suggestion from school/level/specialty (never invents experience). */
export function suggestHeadline(locale: "fr" | "en", x: { school: string; level: string; specialty: string }, wantsPfe = false): string {
  const spec = x.specialty.trim();
  const school = x.school.trim();
  const level = x.level.trim();
  if (!spec && !school) return "";
  if (locale === "fr") {
    const what = wantsPfe ? "un stage PFE" : "un stage";
    return `Élève ingénieur${spec ? ` en ${spec.charAt(0).toLowerCase()}${spec.slice(1)}` : ""}${school ? ` à l'${school}` : ""}${level ? ` (${level})` : ""}, à la recherche d'${what}`;
  }
  const what = wantsPfe ? "a final-year project (PFE) internship" : "an internship";
  return `${spec ? `${spec} ` : ""}engineering student${school ? ` at ${school}` : ""}${level ? ` (${level})` : ""}, looking for ${what}`;
}

/** Tunisian numbers get their +216 so a CV sent abroad stays callable; any other number is kept as typed. */
export function tnPhone(p: string): string {
  const m = p.replace(/[\s.\-()]/g, "").match(/^(?:\+216|00216|216)?([2-9]\d{7})$/);
  return m ? `+216 ${m[1].slice(0, 2)} ${m[1].slice(2, 5)} ${m[1].slice(5)}` : p;
}
