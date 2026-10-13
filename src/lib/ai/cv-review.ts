// AI review of the user's CV: section-by-section feedback and bullet rewrites.
// Grounded in the CV text only; the heuristic fallback reuses the rule-based health check.
import type { Locale, Profile } from "../types";
import { aiJSON, aiText } from "./index";
import { cvHealth, type Finding } from "../cv/health";
import { extractSkills } from "./heuristic";

export interface CvReview {
  score: number; // 0-100
  verdict: string; // one sentence
  strengths: string[];
  improvements: { area: string; issue: string; fix: string; priority: 1 | 2 | 3 }[];
  rewrites: { before: string; after: string; why: string }[];
  missing_sections: string[];
  target_fit: string; // how well the CV matches the user's targets
  engine: string;
  created_at: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number" },
    verdict: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    improvements: {
      type: "array",
      items: {
        type: "object",
        properties: { area: { type: "string" }, issue: { type: "string" }, fix: { type: "string" }, priority: { type: "number" } },
        required: ["area", "issue", "fix", "priority"],
      },
    },
    rewrites: {
      type: "array",
      items: { type: "object", properties: { before: { type: "string" }, after: { type: "string" }, why: { type: "string" } }, required: ["before", "after", "why"] },
    },
    missing_sections: { type: "array", items: { type: "string" } },
    target_fit: { type: "string" },
  },
  required: ["score", "verdict", "strengths", "improvements", "rewrites", "missing_sections", "target_fit"],
};

function prompt(cv: string, profile: Profile, locale: Locale) {
  const lang = locale === "fr" ? "French" : "English";
  const targets = [profile.headline, profile.target_roles.join(", "), profile.target_types.join(", ")].filter(Boolean).join(" · ");
  return {
    system: `You are a senior recruiter and career coach for engineering students in Tunisia (ENIT). Review the candidate's CV for internships (stage, PFE) and junior roles.
Rules: judge only what is in the CV; never invent experience, numbers or employers. Rewrites must keep the facts of the original bullet and only improve wording, structure and impact (use [placeholders] where a number is missing). Be concrete and specific to this CV. Answer in ${lang}. Output JSON only.
Scoring: 0-100 for readiness to send to a recruiter (structure, clarity, impact, relevance to targets, ATS friendliness).`,
    user: `Targets: ${targets || "not set"}\n\nCV:\n${cv.slice(0, 7000)}\n\nReturn: score, a one-sentence verdict, 3-5 strengths, 4-8 improvements (area, issue, fix, priority 1=do first), 3-6 bullet rewrites (before = exact line from the CV, after, why), missing_sections, target_fit (2 sentences).`,
    schema: SCHEMA,
  };
}

const text = (x: unknown) => String(x ?? "").trim();
const strs = (x: unknown, max: number) => (Array.isArray(x) ? x : []).map((s) => text(s).slice(0, 300)).filter(Boolean).slice(0, max);

export async function reviewCv(cv: string, profile: Profile, locale: Locale): Promise<CvReview> {
  return aiJSON(
    profile.settings,
    prompt(cv, profile, locale),
    (raw, engine) => {
      const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const improvements = (Array.isArray(o.improvements) ? o.improvements : [])
        .map((i) => {
          const x = (i ?? {}) as Record<string, unknown>;
          const p = Math.round(Number(x.priority));
          return { area: text(x.area).slice(0, 60), issue: text(x.issue).slice(0, 300), fix: text(x.fix).slice(0, 400), priority: (p >= 1 && p <= 3 ? p : 2) as 1 | 2 | 3 };
        })
        .filter((i) => i.issue)
        .slice(0, 8);
      const rewrites = (Array.isArray(o.rewrites) ? o.rewrites : [])
        .map((r) => {
          const x = (r ?? {}) as Record<string, unknown>;
          return { before: text(x.before).slice(0, 400), after: text(x.after).slice(0, 400), why: text(x.why).slice(0, 200) };
        })
        .filter((r) => r.before && r.after)
        .slice(0, 6);
      if (!improvements.length && !rewrites.length) throw new Error("empty review");
      const score = Math.round(Math.min(100, Math.max(0, Number(o.score) || 0)));
      return {
        score,
        verdict: text(o.verdict).slice(0, 300),
        strengths: strs(o.strengths, 5),
        improvements,
        rewrites,
        missing_sections: strs(o.missing_sections, 6),
        target_fit: text(o.target_fit).slice(0, 500),
        engine,
        created_at: new Date().toISOString(),
      };
    },
    () => heuristicReview(cv, profile, locale),
  );
}

const AREA: Record<string, { fr: string; en: string }> = {
  structure: { fr: "Structure", en: "Structure" },
  impact: { fr: "Impact", en: "Impact" },
  contact: { fr: "Contact", en: "Contact" },
  style: { fr: "Style", en: "Style" },
  dates: { fr: "Dates", en: "Dates" },
};

/** Offline review: maps the rule-based health findings into the same shape, plus simple bullet rewrites. */
export function heuristicReview(cv: string, profile: Profile, locale: Locale): CvReview {
  const fr = locale === "fr";
  const h = cvHealth(cv);
  const sev = (f: Finding): 1 | 2 | 3 => (f.severity === "high" ? 1 : f.severity === "medium" ? 2 : 3);
  const msg: Record<string, { fr: [string, string, string]; en: [string, string, string] }> = {
    empty: { fr: ["structure", "Le CV est vide.", "Collez ou importez votre CV."], en: ["structure", "The CV is empty.", "Paste or upload your CV."] },
    tooShort: { fr: ["structure", "CV très court.", "Ajoutez vos projets académiques, stages, vie associative, avec 2-3 puces chacun."], en: ["structure", "CV is very short.", "Add academic projects, internships, activities, 2-3 bullets each."] },
    tooLong: { fr: ["structure", "CV trop long pour un profil étudiant.", "Visez une page : gardez les 3-4 expériences les plus pertinentes."], en: ["structure", "Too long for a student profile.", "Aim for one page: keep the 3-4 most relevant experiences."] },
    noEducation: { fr: ["structure", "Pas de section Formation.", "Ajoutez ENIT, filière, années, et la prépa."], en: ["structure", "No Education section.", "Add ENIT, specialty, years, and prépa."] },
    noExperience: { fr: ["structure", "Pas de section Expérience ou Projets.", "Même un projet de cours compte : contexte, votre rôle, résultat."], en: ["structure", "No Experience or Projects section.", "Even a course project counts: context, your role, result."] },
    noSkills: { fr: ["structure", "Pas de section Compétences.", "Listez langages, outils, frameworks, par catégorie."], en: ["structure", "No Skills section.", "List languages, tools, frameworks, by category."] },
    noLanguages: { fr: ["structure", "Pas de section Langues.", "Ajoutez arabe, français, anglais avec un niveau (B2, C1…)."], en: ["structure", "No Languages section.", "Add Arabic, French, English with a level (B2, C1…)."] },
    noEmail: { fr: ["contact", "Pas d'e-mail visible.", "Ajoutez un e-mail professionnel en tête de CV."], en: ["contact", "No visible email.", "Add a professional email at the top."] },
    noPhone: { fr: ["contact", "Pas de téléphone.", "Ajoutez un numéro joignable (+216 …)."], en: ["contact", "No phone number.", "Add a reachable number (+216 …)."] },
    noLinks: { fr: ["contact", "Pas de lien GitHub/LinkedIn.", "Un lien GitHub avec vos projets pèse beaucoup pour un stage."], en: ["contact", "No GitHub/LinkedIn link.", "A GitHub link with your projects matters a lot for internships."] },
    fewActionVerbs: { fr: ["impact", "Peu de puces commencent par un verbe d'action.", "Démarrez chaque puce par : Développé, Conçu, Automatisé, Analysé…"], en: ["impact", "Few bullets start with an action verb.", "Start each bullet with: Built, Designed, Automated, Analyzed…"] },
    fewNumbers: { fr: ["impact", "Peu de résultats chiffrés.", "Ajoutez une mesure par projet : utilisateurs, temps gagné, taille des données, note obtenue."], en: ["impact", "Few quantified results.", "Add one measure per project: users, time saved, data size, grade."] },
    longBullets: { fr: ["style", "Certaines puces dépassent 30 mots.", "Coupez en deux puces ou supprimez les détails secondaires."], en: ["style", "Some bullets exceed 30 words.", "Split into two bullets or drop secondary details."] },
    firstPerson: { fr: ["style", "Usage de la première personne (je, mon).", "Écrivez en style télégraphique sans pronom : « Développé une API… »."], en: ["style", "First-person pronouns used.", "Write in telegraphic style without pronouns: \"Built an API…\"."] },
    dateOrder: { fr: ["dates", "Les dates ne sont pas en ordre antichronologique.", "Mettez le plus récent en premier."], en: ["dates", "Dates are not in reverse chronological order.", "Put the most recent first."] },
    dateFormats: { fr: ["dates", "Formats de dates mélangés.", "Utilisez un seul format : « juin 2025 – août 2025 »."], en: ["dates", "Mixed date formats.", "Use a single format: \"Jun 2025 – Aug 2025\"."] },
  };
  const improvements = h.findings.map((f) => {
    const m = msg[f.id]?.[fr ? "fr" : "en"] ?? ["style", f.id, ""];
    return { area: AREA[m[0]]?.[fr ? "fr" : "en"] ?? m[0], issue: m[1], fix: m[2], priority: sev(f) };
  });
  // Bullet rewrites: long bullets without a verb or a number get a template upgrade.
  const rewrites = cv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-*•]\s+/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, ""))
    .filter((l) => l.split(/\s+/).length >= 6 && !/\d/.test(l))
    .slice(0, 4)
    .map((before) => ({
      before,
      after: fr ? `${before.replace(/^(je |j'ai |mon |ma )/i, "")} — résultat : [chiffre, ex. 200 utilisateurs, -30 % de temps]` : `${before.replace(/^(i |my )/i, "")} — result: [number, e.g. 200 users, 30% faster]`,
      why: fr ? "Un résultat mesurable rend la puce crédible et mémorable." : "A measurable result makes the bullet credible and memorable.",
    }));
  const skills = extractSkills(cv);
  const targets = profile.target_roles.join(", ");
  const target_fit = fr
    ? `${skills.length} compétences détectées (${skills.slice(0, 6).join(", ")}). ${targets ? `Cibles : ${targets}. Vérifiez que les mots-clés des offres visées apparaissent tels quels dans le CV.` : "Ajoutez des postes cibles dans votre profil pour une analyse d'adéquation."}`
    : `${skills.length} skills detected (${skills.slice(0, 6).join(", ")}). ${targets ? `Targets: ${targets}. Check that the keywords of your target offers appear verbatim in the CV.` : "Add target roles in your profile for a fit analysis."}`;
  const strengths = [
    h.stats.quantified > 0 ? (fr ? `${h.stats.quantified} puce(s) chiffrée(s).` : `${h.stats.quantified} quantified bullet(s).`) : "",
    h.stats.actionBullets > 0 ? (fr ? `${h.stats.actionBullets} puce(s) avec verbe d'action.` : `${h.stats.actionBullets} action-verb bullet(s).`) : "",
    h.stats.sections.length >= 4 ? (fr ? "Sections principales présentes." : "Main sections present.") : "",
    skills.length >= 8 ? (fr ? "Compétences techniques bien listées." : "Technical skills well listed.") : "",
  ].filter(Boolean);
  return {
    score: h.score,
    verdict: fr
      ? h.score >= 75 ? "CV solide, prêt à envoyer après quelques retouches." : h.score >= 50 ? "Bonne base, mais l'impact et la structure méritent du travail." : "Le CV a besoin d'une refonte avant d'être envoyé."
      : h.score >= 75 ? "Solid CV, ready to send after small touch-ups." : h.score >= 50 ? "Good base, but impact and structure need work." : "The CV needs a rework before sending.",
    strengths,
    improvements,
    rewrites,
    missing_sections: h.findings.filter((f) => f.id.startsWith("no") && !["noEmail", "noPhone", "noLinks"].includes(f.id)).map((f) => f.id.slice(2)),
    target_fit,
    engine: "heuristic",
    created_at: new Date().toISOString(),
  };
}

/**
 * Rewrite the whole CV applying a review's recommendations. Facts stay identical:
 * the model may restructure, reword, reorder and add [placeholders], never new claims.
 * Offline: applies the review's bullet rewrites verbatim and inserts missing section headings.
 */
export async function applyCvReview(cv: string, review: CvReview, profile: Profile, locale: Locale): Promise<{ md: string; engine: string }> {
  const fr = locale === "fr";
  const plan = [
    ...review.improvements.map((i) => `- [${i.area}] ${i.issue} → ${i.fix}`),
    ...review.rewrites.map((r) => `- Replace "${r.before}" with "${r.after}"`),
  ].join("\n");
  const { text, engine } = await aiText(
    profile.settings,
    [
      {
        role: "system",
        content: `You rewrite a student's CV in Markdown, applying a reviewer's recommendations. Hard rules: keep every fact (names, dates, employers, schools, numbers, tools) exactly; never add experience, metrics or skills that are not in the original — where a number is missing write [placeholder]. Keep the candidate's language (${fr ? "French" : "English"}). Output the complete CV as Markdown only, no commentary, no code fence. Structure: # Name, contact line, ## sections (Résumé/Summary, Formation/Education, Expérience/Experience, Projets/Projects, Compétences/Skills, Langues/Languages, …), bullets starting with action verbs.`,
      },
      { role: "user", content: `Recommendations to apply:\n${plan.slice(0, 4000)}\n\nOriginal CV:\n${cv.slice(0, 9000)}` },
    ],
    () => heuristicApply(cv, review, locale),
  );
  const md = text.replace(/^\s*```[\w-]*\s*\n([\s\S]*?)\n\s*```\s*$/, "$1").trim();
  // Guard: a much shorter output means the model dropped content; fall back.
  if (md.length < cv.length * 0.5) return { md: heuristicApply(cv, review, locale), engine: "heuristic" };
  return { md, engine };
}

const SECTION_TITLES: Record<string, { fr: string; en: string }> = {
  Education: { fr: "Formation", en: "Education" },
  Experience: { fr: "Expérience", en: "Experience" },
  Skills: { fr: "Compétences", en: "Skills" },
  Languages: { fr: "Langues", en: "Languages" },
};

export function heuristicApply(cv: string, review: CvReview, locale: Locale): string {
  let md = cv;
  for (const r of review.rewrites) if (r.before && md.includes(r.before)) md = md.replace(r.before, r.after);
  const fr = locale === "fr";
  for (const m of review.missing_sections) {
    const key = m.charAt(0).toUpperCase() + m.slice(1);
    const title = SECTION_TITLES[key]?.[fr ? "fr" : "en"] ?? key;
    if (!new RegExp(`^##\\s*${title}`, "im").test(md)) md += `\n\n## ${title}\n- [${fr ? "à compléter" : "to complete"}]`;
  }
  return md.trim();
}
