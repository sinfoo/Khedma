// Recommendation engine. Pure functions over plain data so they can be unit-tested; the db glue lives in index.ts.
// Every ranking is transparent: a numeric score plus structured reasons the UI renders in the user's language.
import type { Application, Evaluation, Job, JobType } from "../types";
import { extractSkills } from "../ai/heuristic";
import { SUGGESTED_SOURCES, SUGGESTED_TN_SOURCES } from "../sources";
import { feedCountry } from "../sources/catalog";
import { TN_COMPANIES, type TnCompany } from "./companies";
import { detectField, FIELDS, type CandidateModel, type Field } from "./profile-model";
import { cosine, fold, idf, similarity, tfidf, tokenize } from "./similarity";

export interface Reason {
  key: string;
  vars?: Record<string, string | number>;
}

export interface OfferInput {
  job: Job;
  evaluation: Evaluation | null;
  application: Application | null;
}

export interface OfferReco {
  id: number;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  type: JobType;
  deadline: string | null;
  url: string;
  score: number;
  reasons: Reason[];
  evaluation: { global: number; verdict: Evaluation["verdict"]; engine: string } | null;
  tracked: boolean;
  matchedSkills: string[];
  field: Field | null;
}

const DAY = 86_400_000;
const jobText = (j: Job) => `${j.title}\n${j.tags.join(", ")}\n${j.description}`;
const dedupeKey = (j: Job) => `${fold(j.company).trim()}|${fold(j.title).replace(/\s+/g, " ").trim()}`;
const daysUntil = (iso: string | null, now: number) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.ceil((t - now) / DAY);
};
const daysSince = (iso: string, now: number) => {
  const t = new Date(iso.includes("T") || iso.includes("Z") ? iso : iso.replace(" ", "T") + "Z").getTime();
  return Number.isNaN(t) ? 999 : Math.floor((now - t) / DAY);
};
const SENIOR_RE = /\b(senior|lead|principal|architect|\b([4-9]|1\d)\s*\+?\s*(ans|années|years|yrs)\b)/i;

// Soft skills, languages and office tools: not a match signal worth stating, and nothing to "learn next".
const NOT_LEARNABLE = new Set(
  ["Communication", "Teamwork", "Problem Solving", "Autonomy", "Leadership", "Rigor", "Adaptability", "Curiosity", "Creativity", "Time Management",
   "Critical Thinking", "Technical Writing", "English", "French", "German", "Arabic", "Excel", "Jira", "Confluence"].map(fold),
);
const hardSkills = (text: string) => extractSkills(text).filter((s) => !NOT_LEARNABLE.has(fold(s)));

/** Text that stands for the candidate in similarity comparisons. */
export function modelText(model: CandidateModel): string {
  return [
    model.skills.map((s) => s.name).join(" "),
    model.interests.join(" "),
    model.field,
    model.altField ?? "",
  ].join("\n");
}

/** Rank offers for this candidate. Tracked, archived and "skip" offers are penalised, not hidden, unless `hideTracked`. */
export function recommendOffers(
  model: CandidateModel,
  offers: OfferInput[],
  opts: { now?: number; limit?: number; hideTracked?: boolean; targetRoles?: string[] } = {},
): OfferReco[] {
  const now = opts.now ?? Date.now();
  const have = new Set(model.skills.map((s) => fold(s.name)));
  const docs = offers.map((o) => tokenize(jobText(o.job)));
  const weights = idf([...docs, tokenize(modelText(model))]);
  const me = tfidf(tokenize(modelText(model)), weights);
  const seen = new Set<string>();
  const roles = opts.targetRoles ?? [];

  const out: OfferReco[] = offers.map((o, i) => {
    const j = o.job;
    const text = jobText(j);
    const reasons: Reason[] = [];
    let score = 0;

    // skills overlap (0..30) + semantic similarity (0..15)
    const jobSkills = hardSkills(text);
    const matched = jobSkills.filter((s) => have.has(fold(s)));
    if (matched.length) {
      const ratio = Math.min(1, matched.length / Math.max(3, jobSkills.length * 0.6));
      score += 30 * ratio;
      reasons.push({ key: "skills", vars: { n: matched.length, list: matched.slice(0, 3).join(", ") } });
    }
    const sim = cosine(me, tfidf(docs[i], weights));
    score += 15 * Math.min(1, sim * 2.5);

    // field (−8..15)
    const det = detectField(text);
    const field = det?.field ?? null;
    if (field === model.field) {
      score += 15;
      reasons.push({ key: "field", vars: { field: model.field } });
    } else if (field && field === model.altField) {
      score += 8;
      reasons.push({ key: "altField", vars: { field } });
    } else if (field && det && det.scores[field] >= 4) score -= 8;

    // level / job type (−10..12)
    const typeIdx = model.preferredTypes.indexOf(j.type);
    if (typeIdx === 0) {
      score += 12;
      reasons.push({ key: "level", vars: { type: j.type, level: model.level } });
    } else if (typeIdx > 0) score += 6;
    else score -= 6;
    if (SENIOR_RE.test(text) && j.type === "emploi") score -= 10;

    // target roles (0..8)
    const roleHit = roles.find((r) => similarity(r, j.title) >= 0.3);
    if (roleHit) {
      score += 8;
      reasons.push({ key: "role", vars: { role: roleHit } });
    }

    // location / remote (0..8)
    const loc = fold(j.location);
    const city = model.locations.find((c) => loc.includes(fold(c)));
    if (city) {
      score += 8;
      reasons.push({ key: "location", vars: { city } });
    } else if (j.remote && model.remoteOk) {
      score += 6;
      reasons.push({ key: "remote" });
    } else if (!model.locations.length) score += 3;

    // deadline (−20..6)
    const dl = daysUntil(j.deadline, now);
    if (dl !== null) {
      if (dl < 0) score -= 20;
      else if (dl <= 7) {
        score += 6;
        reasons.push({ key: "deadline", vars: { n: dl } });
      } else if (dl <= 21) score += 3;
    }

    // recency (0..5)
    const age = daysSince(j.created_at, now);
    if (age <= 7) {
      score += 5;
      if (age <= 2) reasons.push({ key: "recent" });
    } else if (age <= 30) score += 2;

    // evaluation (−25..10)
    if (o.evaluation) {
      score += (o.evaluation.global - 3) * 5;
      if (o.evaluation.verdict === "skip") score -= 25;
      else if (o.evaluation.global >= 4) reasons.push({ key: "evaluated", vars: { score: o.evaluation.global.toFixed(1) } });
    }

    // penalties
    const tracked = !!o.application;
    if (tracked) score -= 40;
    if (j.archived) score -= 50;
    const key = dedupeKey(j);
    if (seen.has(key)) score -= 30;
    seen.add(key);

    return {
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      remote: j.remote,
      type: j.type,
      deadline: j.deadline,
      url: j.url,
      score: Math.round(Math.max(0, Math.min(100, score))),
      reasons: reasons.slice(0, 4),
      evaluation: o.evaluation ? { global: o.evaluation.global, verdict: o.evaluation.verdict, engine: o.evaluation.engine } : null,
      tracked,
      matchedSkills: matched,
      field,
    };
  });

  return out
    // An offer whose deadline passed is not a recommendation (tracked ones stay: the user decides).
    .filter((r) => (!opts.hideTracked || !r.tracked) && r.score > 0 && (r.tracked || (daysUntil(r.deadline, now) ?? 0) >= 0))
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, opts.limit ?? 12);
}

// ---------- roles & keywords ----------
const ROLES: Record<Field, { role: string; keywords: string[] }[]> = {
  software: [
    { role: "Développeur Back-End", keywords: ["backend", "java", "spring", "api"] },
    { role: "Ingénieur Logiciel", keywords: ["software engineer", "génie logiciel"] },
    { role: "Développeur Full-Stack", keywords: ["full stack", "fullstack"] },
    { role: "Ingénieur QA / Test", keywords: ["test", "qa", "automation"] },
  ],
  web: [
    { role: "Développeur Front-End", keywords: ["frontend", "react", "angular", "vue"] },
    { role: "Développeur Full-Stack", keywords: ["full stack", "node", "next.js"] },
    { role: "Développeur Web", keywords: ["web", "php", "laravel", "symfony"] },
  ],
  mobile: [
    { role: "Développeur Mobile", keywords: ["mobile", "flutter", "android", "ios"] },
    { role: "Développeur Android", keywords: ["android", "kotlin"] },
    { role: "Développeur Flutter", keywords: ["flutter", "dart"] },
  ],
  data: [
    { role: "Data Scientist", keywords: ["data scientist", "machine learning", "python"] },
    { role: "Data Engineer", keywords: ["data engineer", "spark", "etl", "sql"] },
    { role: "Ingénieur Machine Learning", keywords: ["machine learning", "deep learning", "nlp"] },
    { role: "Data Analyst", keywords: ["data analyst", "power bi", "sql"] },
  ],
  embedded: [
    { role: "Ingénieur Systèmes Embarqués", keywords: ["embarqué", "embedded", "stm32", "c"] },
    { role: "Ingénieur IoT", keywords: ["iot", "mqtt", "capteurs"] },
    { role: "Ingénieur Firmware", keywords: ["firmware", "rtos", "microcontrôleur"] },
    { role: "Ingénieur Automatique / Robotique", keywords: ["robotique", "automatique", "ros"] },
  ],
  networks: [
    { role: "Ingénieur Cybersécurité", keywords: ["cybersécurité", "sécurité", "pentest", "soc"] },
    { role: "Ingénieur Réseaux", keywords: ["réseaux", "network", "cisco"] },
    { role: "Administrateur Systèmes & Réseaux", keywords: ["sysadmin", "linux", "administration"] },
  ],
  devops: [
    { role: "Ingénieur DevOps", keywords: ["devops", "ci/cd", "docker", "kubernetes"] },
    { role: "Ingénieur Cloud", keywords: ["cloud", "aws", "azure", "terraform"] },
    { role: "SRE", keywords: ["sre", "monitoring", "observabilité"] },
  ],
  telecom: [
    { role: "Ingénieur Télécom", keywords: ["télécom", "5g", "radio", "transmission"] },
    { role: "Ingénieur Radio / RF", keywords: ["rf", "radio", "antenne"] },
    { role: "Ingénieur Réseaux Télécom", keywords: ["réseaux", "fibre", "voip"] },
  ],
  electrical: [
    { role: "Ingénieur Électrique", keywords: ["électrique", "électrotechnique", "énergie"] },
    { role: "Ingénieur Électronique", keywords: ["électronique", "pcb", "circuit"] },
    { role: "Ingénieur Énergies Renouvelables", keywords: ["photovoltaïque", "solaire", "énergie"] },
    { role: "Ingénieur Automatisme", keywords: ["automatisme", "plc", "automate"] },
  ],
  mechanical: [
    { role: "Ingénieur Mécanique", keywords: ["mécanique", "conception", "solidworks", "catia"] },
    { role: "Ingénieur Conception / CAO", keywords: ["cao", "conception", "catia"] },
    { role: "Ingénieur Mécatronique", keywords: ["mécatronique", "robotique"] },
    { role: "Ingénieur Méthodes", keywords: ["méthodes", "industrialisation", "usinage"] },
  ],
  industrial: [
    { role: "Ingénieur Industriel", keywords: ["industriel", "production", "lean"] },
    { role: "Ingénieur Qualité", keywords: ["qualité", "iso", "amélioration continue"] },
    { role: "Ingénieur Supply Chain / Logistique", keywords: ["supply chain", "logistique", "planification"] },
    { role: "Ingénieur Production", keywords: ["production", "maintenance", "usine"] },
  ],
  civil: [
    { role: "Ingénieur Génie Civil", keywords: ["génie civil", "btp", "structure"] },
    { role: "Ingénieur Structures", keywords: ["structure", "béton", "robot"] },
    { role: "Ingénieur Travaux / Chantier", keywords: ["chantier", "travaux", "conducteur"] },
  ],
  business: [
    { role: "Business Analyst", keywords: ["business analyst", "analyse fonctionnelle"] },
    { role: "Business Intelligence", keywords: ["bi", "power bi", "reporting"] },
    { role: "Consultant ERP", keywords: ["erp", "sap", "odoo"] },
    { role: "Chef de projet junior", keywords: ["chef de projet", "gestion de projet", "pmo"] },
  ],
};

export interface RoleReco {
  role: string;
  keywords: string[];
  why: Reason;
}

/** Target roles + search keywords the user has not set yet, for the detected field (then the alternate field). */
export function recommendRoles(model: CandidateModel, existingRoles: string[] = []): RoleReco[] {
  const has = (r: string) => existingRoles.some((e) => fold(e) === fold(r) || similarity(e, r) >= 0.6);
  const skillSet = new Set(model.skills.map((s) => fold(s.name)));
  const forField = (f: Field, why: Reason) =>
    ROLES[f]
      .filter((r) => !has(r.role))
      .map((r) => {
        const hit = r.keywords.filter((k) => skillSet.has(fold(k)));
        return { role: r.role, keywords: r.keywords, why: hit.length ? { key: "skills", vars: { list: hit.join(", ") } } : why };
      });
  const out = forField(model.field, { key: "field", vars: { field: model.field } });
  if (model.altField && model.altField !== model.field) out.push(...forField(model.altField, { key: "altField", vars: { field: model.altField } }));
  return out.filter((r, i, a) => a.findIndex((x) => x.role === r.role) === i).slice(0, 6);
}

// ---------- sources ----------
export type SourceReco =
  | { kind: "provider"; label: string; providerKind: string; handle: string; why: Reason; keywords: string[] }
  | { kind: "company"; label: string; url: string; why: Reason; city: string; fields: Field[] };

const TANIT_BY_FIELD: Partial<Record<Field, string>> = {
  software: "705/informatique-jobs",
  web: "705/informatique-jobs",
  mobile: "705/informatique-jobs",
  data: "381/technologie-de-l-information-jobs",
  devops: "381/technologie-de-l-information-jobs",
  networks: "381/technologie-de-l-information-jobs",
  embedded: "969/electronique-jobs",
  electrical: "969/electronique-jobs",
  telecom: "710/télécommunications-jobs",
  mechanical: "968/mécanique-jobs",
  industrial: "378/industrie-jobs",
  civil: "707/ingenierie-jobs",
  business: "",
};
const FARO_BY_FIELD: Partial<Record<Field, string>> = {
  software: "informatique", web: "informatique", mobile: "informatique", data: "informatique", devops: "informatique", networks: "informatique",
  telecom: "telecommunication", industrial: "production", mechanical: "maintenance-industrielle", electrical: "maintenance-industrielle",
  business: "statistiques", embedded: "informatique", civil: "",
};
const IT_FIELDS: Field[] = ["software", "web", "mobile", "data", "devops", "networks"];

export function recommendSources(model: CandidateModel, existing: { kind: string; handle: string }[]): SourceReco[] {
  const exists = (kind: string, handle: string) => existing.some((e) => e.kind === kind && fold(e.handle) === fold(handle));
  const keywords = recommendRoles(model, []).flatMap((r) => r.keywords).filter((k, i, a) => a.indexOf(k) === i).slice(0, 6);
  const out: SourceReco[] = [];
  const companies: SourceReco[] = [];

  // Tunisian boards, with the category that matches the field.
  for (const s of SUGGESTED_TN_SOURCES) {
    const handle = s.kind === "tanitjobs" ? (TANIT_BY_FIELD[model.field] ?? s.handle) : s.kind === "farojob" ? (FARO_BY_FIELD[model.field] ?? s.handle) : s.handle;
    if (exists(s.kind, handle)) continue;
    const label = s.kind === "tanitjobs" || s.kind === "farojob" ? s.label.split(" – ")[0] : s.label;
    out.push({ kind: "provider", label, providerKind: s.kind, handle, why: { key: "tnBoard", vars: { field: model.field } }, keywords });
  }
  // International ATS boards only make sense for IT tracks (that is what those companies hire for).
  if (IT_FIELDS.includes(model.field) || (model.altField && IT_FIELDS.includes(model.altField))) {
    for (const s of SUGGESTED_SOURCES) {
      if (exists(s.kind, s.handle)) continue;
      // Country feeds (Jobindex, Net-Empregos…) are not remote boards: they run only for their country.
      if (s.kind === "rss" && (!model.remoteOk || feedCountry(s.handle))) continue;
      out.push({ kind: "provider", label: s.label, providerKind: s.kind, handle: s.handle, why: { key: model.remoteOk ? "remoteBoard" : "intlBoard" }, keywords: [] });
    }
  }
  // Companies by field, home city first.
  const rank = (c: TnCompany) =>
    (c.fields.includes(model.field) ? 2 : c.fields.includes(model.altField ?? ("" as Field)) ? 1 : 0) + (model.locations.some((l) => fold(l) === fold(c.city)) ? 0.5 : 0);
  for (const c of TN_COMPANIES.filter((c) => rank(c) > 0).sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name))) {
    if (c.source && exists(c.source.kind, c.source.handle)) continue;
    companies.push({
      kind: "company",
      label: c.name,
      url: c.url,
      city: c.city,
      fields: c.fields,
      why: { key: c.fields.includes(model.field) ? "companyField" : "companyAlt", vars: { field: c.fields.includes(model.field) ? model.field : (model.altField ?? model.field), city: c.city } },
    });
  }
  // Boards and employers are capped separately so one list never crowds out the other.
  return [...out.slice(0, 6), ...companies.slice(0, 10)];
}

// ---------- skills to learn ----------
export interface SkillReco {
  skill: string;
  demand: number;
  unlocks: number;
  proximity: number;
  score: number;
  jobs: number[];
}

/** Skills requested by the offers that the candidate lacks, ranked by demand × closeness to their field. */
export function recommendSkills(model: CandidateModel, jobs: Job[], limit = 8): SkillReco[] {
  const have = new Set(model.skills.map((s) => fold(s.name)));
  const perJob = jobs.map((j) => ({ id: j.id, skills: hardSkills(jobText(j)), field: detectField(jobText(j))?.field ?? null }));
  const stats = new Map<string, { demand: number; unlocks: number; near: number; jobs: number[] }>();
  for (const j of perJob) {
    const missing = j.skills.filter((s) => !have.has(fold(s)));
    const covered = j.skills.length ? (j.skills.length - missing.length) / j.skills.length : 0;
    for (const s of missing) {
      const st = stats.get(s) ?? { demand: 0, unlocks: 0, near: 0, jobs: [] };
      st.demand++;
      st.jobs.push(j.id);
      // "Unlocks" = this is one of at most two missing skills and most of the rest is covered.
      if (missing.length <= 2 && covered >= 0.5) st.unlocks++;
      if (j.field === model.field) st.near++;
      else if (j.field === model.altField) st.near += 0.5;
      stats.set(s, st);
    }
  }
  return [...stats.entries()]
    .map(([skill, st]) => {
      const proximity = st.demand ? Math.round((0.4 + 0.6 * (st.near / st.demand)) * 100) / 100 : 0.4;
      return { skill, demand: st.demand, unlocks: st.unlocks, proximity, score: Math.round(st.demand * proximity * 10 + st.unlocks * 5), jobs: st.jobs };
    })
    .sort((a, b) => b.score - a.score || b.demand - a.demand || a.skill.localeCompare(b.skill))
    .slice(0, limit);
}

// ---------- next actions ----------
export interface ActionState {
  now?: number;
  hasCv: boolean;
  offers: OfferReco[];
  unevaluated: number;
  sources: number;
  lastScanAt: string | null;
  targetRoles: number;
  applications: { id: number; title: string; company: string; status: Application["status"]; lastContactAt: string | null; interviewAt: string | null }[];
  skills: SkillReco[];
}

export interface ActionReco {
  key: string;
  vars?: Record<string, string | number>;
  href: string;
  priority: number;
  tone: "accent" | "saffron" | "danger" | "success";
}

export function recommendActions(model: CandidateModel, s: ActionState): ActionReco[] {
  const now = s.now ?? Date.now();
  const out: ActionReco[] = [];
  const add = (key: string, href: string, priority: number, tone: ActionReco["tone"] = "accent", vars?: ActionReco["vars"]) =>
    out.push({ key, vars, href, priority, tone });

  if (!s.hasCv) add("noCv", "/app/profile", 100, "danger");
  if (s.hasCv && model.weaknesses.some((w) => w.key === "noQuantified")) add("cvNoQuantified", "/app/profile", 60, "saffron");
  if (model.weaknesses.some((w) => w.key === "fewSkills")) add("fewSkills", "/app/profile", 55, "saffron");
  if (!s.targetRoles) add("noTargets", "#roles", 70);
  if (!s.sources) add("noSources", "/app/sources", 80);
  else if (s.lastScanAt && daysSince(s.lastScanAt, now) >= 3) add("staleScan", "/app/sources", 40, "saffron", { n: daysSince(s.lastScanAt, now) });
  if (s.unevaluated) add("unevaluated", "/app/jobs", 65, "accent", { n: s.unevaluated });

  const strong = s.offers.filter((o) => !o.tracked && o.score >= 60);
  if (strong.length) add("strongUntracked", "#offers", 75, "success", { n: strong.length });
  const soon = s.offers.find((o) => !o.tracked && o.deadline && (daysUntil(o.deadline, now) ?? 99) <= 5 && (daysUntil(o.deadline, now) ?? -1) >= 0);
  if (soon) add("deadlineSoon", `/app/jobs/${soon.id}`, 90, "danger", { title: soon.title, company: soon.company, n: daysUntil(soon.deadline, now) ?? 0 });

  for (const a of s.applications) {
    if (a.interviewAt) {
      const d = daysUntil(a.interviewAt, now);
      if (d !== null && d >= 0 && d <= 3) add("interviewSoon", `/app/pipeline/${a.id}`, 95, "saffron", { company: a.company, n: d });
    }
    if (a.status === "applied" && a.lastContactAt) {
      const d = daysSince(a.lastContactAt, now);
      if (d >= 7) add("followUp", `/app/pipeline/${a.id}`, 68, "saffron", { company: a.company, n: d });
    }
  }
  if (s.applications.some((a) => a.status === "interview") || strong.length >= 3) add("mockInterview", "/app/coach", 45, "accent", { field: model.field });
  if (s.skills[0]) add("learnSkill", "/app/upskill", 35, "accent", { skill: s.skills[0].skill, n: s.skills[0].demand });
  if (model.weaknesses.some((w) => w.key === "noLinks")) add("noLinks", "/app/profile", 30);

  return out.sort((a, b) => b.priority - a.priority).slice(0, 7);
}

// ---------- companies in your offers ----------
export interface CompanyReco {
  company: string;
  offers: number;
  fit: number;
  fields: Field[];
  untracked: number;
  top: { id: number; title: string; score: number }[];
}

export function recommendCompanies(offers: OfferReco[], model: CandidateModel, limit = 8): CompanyReco[] {
  const by = new Map<string, OfferReco[]>();
  for (const o of offers) {
    const k = fold(o.company).trim();
    if (!k) continue;
    by.set(k, [...(by.get(k) ?? []), o]);
  }
  return [...by.values()]
    .map((list) => {
      const sorted = list.slice().sort((a, b) => b.score - a.score);
      const top3 = sorted.slice(0, 3);
      const fields = [...new Set(list.map((o) => o.field).filter((f): f is Field => !!f))].sort((a, b) => FIELDS.indexOf(a) - FIELDS.indexOf(b));
      // Fit = mean of the best three offer scores, nudged when the company hires in the candidate's field.
      const fit = Math.round(top3.reduce((s, o) => s + o.score, 0) / top3.length + (fields.includes(model.field) ? 5 : 0));
      return {
        company: sorted[0].company,
        offers: list.length,
        fit: Math.min(100, fit),
        fields,
        untracked: list.filter((o) => !o.tracked).length,
        top: top3.map((o) => ({ id: o.id, title: o.title, score: o.score })),
      };
    })
    .sort((a, b) => b.fit - a.fit || b.offers - a.offers || a.company.localeCompare(b.company))
    .slice(0, limit);
}
