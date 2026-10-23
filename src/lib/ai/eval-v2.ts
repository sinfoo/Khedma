// Evaluation v2, zero-LLM parts: requirement extraction (two-pass: importance from the posting
// before looking at the CV), posting legitimacy, company type, compensation reliability,
// level plan and CV changes. Pure functions; the LLM path reuses the shaping helpers.
import type { CompanyType, CompReliability, Evaluation, EvidenceTier, Importance, Job, Legitimacy, Locale, Profile, Requirement } from "../types";
import { IMPORTANCE, EVIDENCE_TIERS } from "../types";
import { extractSkills, heuristicEvaluate } from "./heuristic";
import { extractSalaryMentions } from "../salaries";
import { detectField, detectSeniorityMonths } from "../recommend/profile-model";

export const MAX_REQUIREMENTS = 12;
const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const jobText = (job: Job) => `${job.title}\n${job.tags.join(", ")}\n${job.description}`;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// ---------- requirements ----------
const STATED_RE = /\b(must|required|requirement|essential|mandatory|exig[ée]e?s?|requis(e|es)?|obligatoire|indispensable|imp[ée]rati(f|ve)|ma[îi]trise|minimum|at least|au moins)\b/i;
const SOFT = new Set(["Teamwork", "Communication", "Problem Solving", "Autonomy", "Leadership", "Rigor", "Adaptability", "Curiosity", "Creativity", "Time Management", "Critical Thinking"]);
const PREFERRED_RE = /\b(preferred|nice[- ]to[- ]have|bonus|a plus|plus\b|souhait[ée]e?s?|appr[ée]ci[ée]e?s?|serait un plus|idéalement|ideally|optional|optionnel)\b/i;
const GATE_RE = /\b(anglais|english|fran[cç]ais|french|allemand|german|visa|autorisation de travail|work authori[sz]ation|citoyen|citizen|permis|licence|\d+\s*\+?\s*(ans|ann[ée]es|years))\b/i;
const SECTION_RE = /^(profil|profile|requirements?|qualifications?|comp[ée]tences|skills|pr[ée]requis|ce que nous (cherchons|recherchons)|what (we('re| are) looking for|you('ll)? (bring|need))|exigences|must[- ]haves?|nice[- ]to[- ]have|atouts?|bonus|preferred|souhait[ée]|plus)\b/i;
const BOILERPLATE_RE = /\b(dynamique|motiv[ée]|passionn[ée]|team ?player|esprit d'[ée]quipe|communication|rigueur|rigor|autonom|curio|adaptab|self[- ]starter|fast[- ]paced|proactive?|force de proposition)\b/i;
const STOP = new Set(["avec", "pour", "dans", "des", "les", "une", "vous", "nous", "sur", "the", "and", "with", "for", "you", "our", "that", "this", "from", "have", "will", "are", "etc", "bonne", "bonnes", "good", "strong", "experience", "expérience", "connaissance", "knowledge", "niveau", "level"]);

/** Split a posting into candidate requirement sentences, tagging the section they sit in. */
function sentences(description: string): { text: string; inReqSection: boolean }[] {
  const out: { text: string; inReqSection: boolean }[] = [];
  let inReq = false;
  for (const raw of description.split(/\r?\n/)) {
    const line = raw.replace(/^[\s\-*•·▪◦]+|[\s:]+$/g, "").trim();
    if (!line) continue;
    if (line.length <= 60 && SECTION_RE.test(line) && !/[.!?]/.test(line)) {
      inReq = true;
      continue;
    }
    if (line.length <= 48 && /^(missions?|responsabilit|tasks?|what you('ll)? do|about|à propos|avantages|benefits|nous offrons|we offer)/i.test(line)) {
      inReq = false;
      continue;
    }
    for (const s of line.split(/(?<=[.;!?])\s+(?=[A-ZÀ-Ý])/)) {
      const t = s.trim();
      if (t.length >= 8 && t.length <= 240) out.push({ text: t, inReqSection: inReq });
    }
  }
  return out;
}

const IMPORTANCE_RANK: Record<Importance, number> = { critical: 0, high: 1, meaningful: 2, preferred: 3, low_signal: 4 };
const MET_RANK = { no: 0, partial: 1, yes: 2 } as const;

/** Inferred rows can never be critical/high (career-ops gate). */
export function capInferred(importance: Importance, evidence: EvidenceTier): Importance {
  return evidence === "inferred" && (importance === "critical" || importance === "high") ? "meaningful" : importance;
}

/** Sort importance desc, then unmet first; keep at most MAX_REQUIREMENTS rows. */
export function sortRequirements(rows: Requirement[]): Requirement[] {
  return [...rows]
    .sort((a, b) => IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance] || MET_RANK[a.met] - MET_RANK[b.met] || a.text.localeCompare(b.text))
    .slice(0, MAX_REQUIREMENTS);
}

/** First CV line mentioning one of the skills (canonical name or alias), as verbatim proof. */
function cvProof(cv: string, skills: string[]): string {
  if (!skills.length) return "";
  const want = new Set(skills.map(fold));
  for (const line of cv.split(/\r?\n/)) {
    const l = fold(line);
    if (want.size && ([...want].some((s) => l.includes(s)) || extractSkills(line).some((k) => want.has(fold(k)))))
      return clip(line.replace(/^[\s\-*#]+/, "").replace(/[*_`]/g, "").trim(), 160);
  }
  return "";
}

/** Pass 1: importance from the posting alone. Pass 2: match against the CV. */
export function heuristicRequirements(job: Job, profile: Profile): Requirement[] {
  const cv = `${profile.skills.join(", ")}\n${profile.cv_md}`;
  const have = new Set([...profile.skills, ...extractSkills(cv)].map(fold));
  const titleSkills = new Set(extractSkills(job.title).map(fold));
  const body = fold(job.description);
  const rows: Requirement[] = [];
  const covered = new Set<string>();

  // Pass 1 — sentence rules on the posting only.
  const pass1: { text: string; importance: Importance; evidence: EvidenceTier; skills: string[] }[] = [];
  for (const s of sentences(job.description)) {
    const stated = STATED_RE.test(s.text);
    const preferred = PREFERRED_RE.test(s.text);
    const all = extractSkills(s.text);
    const skills = all.filter((k) => !SOFT.has(k));
    const softOnly = all.length > 0 && skills.length === 0;
    if (!stated && !preferred && !s.inReqSection) continue;
    if (!skills.length && !GATE_RE.test(s.text) && !stated && !softOnly) continue;
    if (!stated && !preferred && skills.length && skills.every((k) => covered.has(fold(k)))) continue; // same skill, second mention
    let importance: Importance;
    let evidence: EvidenceTier;
    if (stated && !preferred) {
      evidence = "stated";
      importance = skills.some((k) => titleSkills.has(fold(k))) || GATE_RE.test(s.text) ? "critical" : "high";
    } else if (preferred) {
      evidence = stated ? "stated" : "structural";
      importance = "preferred";
    } else {
      evidence = "structural";
      importance = BOILERPLATE_RE.test(s.text) && !skills.length ? "low_signal" : "meaningful";
    }
    if ((softOnly || BOILERPLATE_RE.test(s.text)) && !skills.length && importance !== "critical") importance = "low_signal";
    pass1.push({ text: clip(s.text, 160), importance: capInferred(importance, evidence), evidence, skills });
    for (const k of skills) covered.add(fold(k));
  }
  // Skills named in the posting but not inside any requirement sentence: title = stated, repeated = structural, else inferred.
  for (const k of extractSkills(jobText(job))) {
    const f = fold(k);
    if (covered.has(f)) continue;
    covered.add(f);
    const n = body.split(f).length - 1;
    const evidence: EvidenceTier = titleSkills.has(f) ? "stated" : n >= 2 ? "structural" : "inferred";
    const importance: Importance = titleSkills.has(f) ? "critical" : n >= 2 ? "meaningful" : "preferred";
    pass1.push({ text: k, importance: capInferred(importance, evidence), evidence, skills: [k] });
  }

  // Pass 2 — the CV. Importance is never revised here.
  for (const r of pass1) {
    let met: Requirement["met"];
    let proof = "";
    if (r.skills.length) {
      const hit = r.skills.filter((k) => have.has(fold(k)));
      met = hit.length === r.skills.length ? "yes" : hit.length ? "partial" : "no";
      proof = cvProof(profile.cv_md, hit);
    } else {
      const toks = fold(r.text).split(/[^\p{L}\p{N}+#]+/u).filter((t) => t.length >= 5 && !STOP.has(t));
      const cvf = fold(cv);
      const hit = toks.filter((t) => cvf.includes(t));
      met = hit.length ? "partial" : "no";
      proof = hit.length ? cvProof(profile.cv_md, hit) : "";
    }
    rows.push({ text: r.text, importance: r.importance, evidence: r.evidence, met, proof });
  }
  return sortRequirements(rows);
}

/** Coerce LLM output into Requirement rows (unknown enums dropped, inferred capped, sorted, ≤12). */
export function shapeRequirements(raw: unknown, cv: string): Requirement[] {
  const rows: Requirement[] = [];
  const cvf = fold(cv);
  for (const x of Array.isArray(raw) ? raw : []) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const text = clip(String(o.text ?? "").trim(), 160);
    if (!text) continue;
    const importance = (IMPORTANCE as readonly string[]).includes(String(o.importance)) ? (o.importance as Importance) : "meaningful";
    const evidence = (EVIDENCE_TIERS as readonly string[]).includes(String(o.evidence)) ? (o.evidence as EvidenceTier) : "inferred";
    const metRaw = String(o.met ?? "");
    const met = metRaw === "yes" || metRaw === "partial" || metRaw === "no" ? metRaw : "no";
    let proof = clip(String(o.proof ?? "").trim(), 160);
    // A proof the CV does not contain is not a proof.
    if (proof && !cvf.includes(fold(proof.replace(/…$/, "").slice(0, 40)))) proof = "";
    rows.push({ text, importance: capInferred(importance, evidence), evidence, met: met === "yes" && !proof ? "partial" : met, proof });
  }
  return sortRequirements(rows);
}

// ---------- legitimacy (Block G + trust filter), zero-LLM ----------
const SHORTENERS = /(^|\.)(bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|rb\.gy|shorturl\.at|tiny\.cc|is\.gd|forms\.gle|wa\.me|chat\.whatsapp\.com|t\.me|typeform\.com|forms\.office\.com|surveymonkey\.com)$/i;
const FORM_PATH = /docs\.google\.com\/forms/i;
const BOARDS = /(greenhouse|lever\.co|ashbyhq|workable|smartrecruiters|recruitee|bamboohr|breezy\.hr|jobs\.gem\.com|ats\.rippling\.com|flatchr|jobscore|teamtailor|myworkdayjobs|workday|linkedin|indeed|keejob|tanitjobs|emploitunisie|farojob|welcometothejungle|glassdoor|jobup|jobs\.ch|job-room|remoteok|jobicy|himalayas|remotive|adzuna|jooble|reed\.co|findwork|arbeitnow|wantedly|daijob|jobbank|englishjobs|aijobs|enitjobs|hellowork|apec\.fr|monster|stepstone|xing|successfactors|icims|taleo|phenom|jobvite|eightfold|personio|zoho|rekrute|optioncarriere|bayt|jobijoba)/i;
const WEBMAIL = /@(gmail|yahoo|hotmail|outlook|live|icloud|protonmail|yandex)\./i;
const FEES = /frais (de |d')(dossier|inscription|candidature|formation)|payer pour postuler|pay to apply|application fee|registration fee|training fee|frais de formation obligatoire/i;
const INJECTION = /ignore (all |any )?(previous|prior|above) instructions|as an ai|you are (an? )?(ai|llm|assistant)|rate this (posting|job) (highly|5)|score this (as|at)/i;
const DAY = 86_400_000;

export function computeLegitimacy(job: Job, now = Date.now()): Legitimacy {
  const signals: { key: string; delta: number }[] = [];
  const add = (key: string, delta: number) => signals.push({ key, delta });
  let host = "";
  if (/^manual:\/\//.test(job.url) || !job.url.trim()) add("missing_apply_url", -40);
  else {
    try {
      const u = new URL(job.url);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
      host = u.hostname.toLowerCase();
      if (SHORTENERS.test(host) || FORM_PATH.test(job.url)) add("suspicious_domain", -25);
      else if (!BOARDS.test(host)) {
        const toks = fold(job.company).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !/^(sarl|group|groupe|tunisie|tunisia|technologies|solutions|digital|services|consulting|systems|international)$/.test(t));
        const h = host.replace(/[^a-z0-9]/g, "");
        if (toks.length && !toks.some((t) => h.includes(t))) add("company_domain_mismatch", -15);
      }
    } catch {
      add("invalid_url", -50);
    }
  }
  const text = `${job.title}\n${job.description}`;
  if (job.description.trim().length < 300) add("short_description", -20);
  if (WEBMAIL.test(text)) add("webmail_contact", -10);
  if (FEES.test(text)) add("fees", -30);
  if (INJECTION.test(text)) add("instructions_in_posting", -15);
  if (job.posted_at) {
    const age = Math.floor((now - new Date(job.posted_at).getTime()) / DAY);
    if (Number.isFinite(age)) {
      if (age < 30) add("fresh", 0);
      else if (age <= 60) add("age_mixed", -10);
      else add("age_old", -25);
    }
  } else add("no_date", -15); // "proceed with caution", never enough for "suspicious" on its own
  const m = extractSalaryMentions(text).find((x) => x.max > x.min);
  if (m && m.max - m.min > 0.5 * m.min) add("wide_pay_range", -10);
  const score = Math.max(0, Math.min(100, 100 + signals.reduce((s, x) => s + x.delta, 0)));
  const tier = score >= 90 ? "high" : score >= 60 ? "caution" : "suspicious";
  return { tier, score, signals };
}

// ---------- company type & compensation reliability (Block D) ----------
const TYPE_RULES: [CompanyType, RegExp][] = [
  ["staffing", /\b(cabinet de recrutement|recruitment agency|staffing|recruteur pour le compte|pour le compte de (notre|son) client|our client|notre client|int[ée]rim|portage)\b/i],
  ["commission", /\b(ote|uncapped|commission|t[ée]l[ée]vente|telesales|prime sur objectifs?|r[ée]mun[ée]ration variable (non plafonn|attractive))\b/i],
  ["public_academic", /\b(minist[èe]re|universit[ée]|university|[ée]cole|facult[ée]|laboratoire|laboratory|institut|cnrs|inria|research (center|centre)|public|gouvernement|government|onu|unicef|giz|ong\b|ngo\b|nonprofit|non-profit)\b/i],
  ["community", /\b(association|communaut[ée]|community|open[- ]source|foundation|fondation|b[ée]n[ée]vol|volunteer|club)\b/i],
  ["agency", /\b(ssii|esn|offshore|nearshore|outsourcing|soci[ée]t[ée] de services|consulting|conseil|agence (web|digitale)|web agency|digital agency|prestataire|r[ée]gie|mission client|chez (nos|le) clients?)\b/i],
  ["big_tech", /\b(fortune 500|cot[ée]e? en bourse|publicly traded|nasdaq|nyse|cac 40|big tech|microsoft|google|amazon|meta|apple|ibm|oracle|sap|cisco|intel|nvidia|siemens|bosch|capgemini|accenture|sopra|atos|ericsson|nokia|huawei|orange|ooredoo|vermeg|telnet)\b/i],
  ["growth_startup", /\b(scale[- ]?up|s[ée]rie [abc]|series [abc]|lev[ée]e de fonds|funded|vc[- ]backed|hyper[- ]?croissance|hypergrowth|licorne|unicorn)\b/i],
  ["early_startup", /\b(start[- ]?up|early[- ]stage|pre[- ]seed|seed|mvp|incubat|acc[ée]l[ée]rat|fondateurs?|founders?|jeune (entreprise|pousse))\b/i],
  ["enterprise", /\b(groupe|group|multinational|leader (mondial|europ[ée]en|tunisien)|filiale|subsidiary|corporate|enterprise|\b\d{3,}\s*(employ[ée]s|collaborateurs|employees|people)\b|usine|plant|banque|bank|assurance|insurance|telecom)\b/i],
  ["local_smb", /\b(pme|sme|tpe|small (business|company)|petite (entreprise|structure)|family[- ]owned|familiale|cabinet|bureau d'[ée]tudes|atelier)\b/i],
];

export function classifyCompanyType(job: Job): CompanyType {
  const text = `${job.company}\n${job.description}`;
  for (const [type, re] of TYPE_RULES) if (re.test(text)) return type;
  return "unknown";
}

const LOW_RELIABILITY = /\b(up to|jusqu'[àa]|jusqu[àa]|ote|uncapped|non plafonn|total package|package (global|total)|comprehensive salary|including allowances|primes? incluses?|allocations? incluses?|performance bonus included|attendance bonus|kpi bonus|base \+ (variable|commission)|fixe \+ (variable|commission)|13(th|e|ème) (salary|mois) (included|inclus)|selon r[ée]sultats|selon performance|according to results)\b/i;
const BASE_STATED = /\b(salaire (de base|fixe|brut)|base salary|fixed salary|brut mensuel|gross monthly|net mensuel|net monthly|gratification (mensuelle|fixe)|stipend of|fixe de)\b/i;

export function compReliability(job: Job): CompReliability {
  const text = `${job.title}\n${job.description}`;
  const mentions = extractSalaryMentions(text);
  if (!mentions.length) return "unknown";
  if (LOW_RELIABILITY.test(text)) return "low";
  if (mentions.some((m) => m.max - m.min > 0.5 * m.min)) return "low";
  return BASE_STATED.test(text) ? "high" : "medium";
}

// ---------- level plan, CV changes, archetype ----------
const SENIOR_RE = /\b(senior|lead|principal|staff|architect|head of|directeur|manager)\b/i;
const YEARS_RE = /(\d{1,2})\s*\+?\s*(ans|ann[ée]es|years|yrs)\b/i;
const JUNIOR_RE = /\b(junior|stagiaire|intern(ship)?|stage|pfe|alternan|apprenti|graduate|d[ée]butant|entry[- ]level|jeune dipl[ôo]m[ée])\b/i;

export function heuristicLevelPlan(job: Job, profile: Profile, locale: Locale): string {
  const text = jobText(job);
  const years = Number(text.match(YEARS_RE)?.[1] ?? 0);
  const months = detectSeniorityMonths(profile.cv_md);
  const senior = SENIOR_RE.test(job.title) || years >= 4;
  const junior = JUNIOR_RE.test(text) && !senior;
  const fr = locale === "fr";
  if (junior && years === 0) return fr ? "Niveau attendu : débutant / stage. Votre niveau d'études correspond ; mettez en avant 2 projets concrets et votre disponibilité." : "Expected level: entry / internship. Your study level fits; lead with 2 concrete projects and your availability.";
  const gap = Math.max(0, years * 12 - months);
  if (gap > 0)
    return fr
      ? `L'offre demande ${years} an(s) d'expérience ; votre CV en montre ${Math.round(months / 12 * 10) / 10}. Si vous postulez : présentez stages et projets comme expérience, citez des résultats mesurables, et acceptez un éventuel reclassement (stage, junior) à condition d'un cadre clair (encadrement, période d'essai, revue à 6 mois).`
      : `The posting asks for ${years} year(s) of experience; your CV shows ${Math.round(months / 12 * 10) / 10}. If you apply: frame internships and projects as experience, quote measurable results, and accept a possible downlevel (intern, junior) only with a clear frame (mentoring, probation, 6-month review).`;
  return fr ? "Niveau cohérent avec votre profil. Vendez vos projets avec des résultats chiffrés, sans gonfler le titre." : "Level consistent with your profile. Sell your projects with measurable results, without inflating the title.";
}

export function heuristicCvChanges(job: Job, profile: Profile, reqs: Requirement[], locale: Locale): string[] {
  const fr = locale === "fr";
  const out: string[] = [];
  const unmet = reqs.filter((r) => r.met !== "yes" && (r.importance === "critical" || r.importance === "high" || r.importance === "meaningful"));
  const partial = reqs.filter((r) => r.met === "partial" && r.proof);
  const matched = reqs.filter((r) => r.met === "yes").map((r) => r.text).slice(0, 3);
  out.push(fr ? `Résumé en tête de CV nommant le poste « ${job.title} » chez ${job.company}${matched.length ? ` et vos atouts : ${matched.join(", ")}` : ""}.` : `Summary at the top naming the “${job.title}” role at ${job.company}${matched.length ? ` and your strengths: ${matched.join(", ")}` : ""}.`);
  for (const r of partial.slice(0, 2)) out.push(fr ? `Renforcer la ligne « ${r.proof} » avec le vocabulaire de l'offre (${r.text}) : reformuler, jamais inventer.` : `Strengthen the line “${r.proof}” with the posting's wording (${r.text}): reformulate, never invent.`);
  for (const r of unmet.filter((x) => x.met === "no").slice(0, 2)) out.push(fr ? `« ${r.text} » : absent du CV. N'ajoutez ce point que si un projet ou un cours le couvre réellement ; sinon préparez une réponse honnête en entretien.` : `“${r.text}”: missing from your CV. Add it only if a project or course genuinely covers it; otherwise prepare an honest interview answer.`);
  out.push(fr ? "Placer en premier le projet le plus proche des missions de l'offre ; une ligne de résultat par projet." : "Move the project closest to the posting's missions first; one result line per project.");
  return out.slice(0, 5);
}

export function heuristicArchetype(job: Job): string {
  return detectField(jobText(job))?.field ?? "";
}

// ---------- assembly ----------
export type EvaluationV2Fields = Pick<Evaluation, "requirements" | "legitimacy" | "company_type" | "comp_reliability" | "level_plan" | "cv_changes" | "archetype">;

/** Everything the deterministic path can fill, independent of the engine. */
export function heuristicV2Fields(job: Job, profile: Profile): EvaluationV2Fields {
  const locale = profile.settings.locale;
  const requirements = heuristicRequirements(job, profile);
  return {
    requirements,
    legitimacy: computeLegitimacy(job),
    company_type: classifyCompanyType(job),
    comp_reliability: compReliability(job),
    level_plan: heuristicLevelPlan(job, profile, locale),
    cv_changes: heuristicCvChanges(job, profile, requirements, locale),
    archetype: heuristicArchetype(job),
  };
}

/** Heuristic evaluation in the full v2 shape (5 dimensions + v2 fields). */
export function heuristicEvaluateV2(job: Job, profile: Profile): Omit<Evaluation, "id" | "created_at" | "job_id"> {
  return { ...heuristicEvaluate(job, profile), ...heuristicV2Fields(job, profile) };
}
