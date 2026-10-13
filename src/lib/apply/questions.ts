// ATS / application-form question bank, posting-based detection and the
// offline answer assembler. Pure: no DB, no network. Answers are built only
// from tokens present in the CV, the profile and the posting.
import type { Job, Locale, Profile } from "../types";
import { extractSkills } from "../ai/heuristic";
import { clampChars } from "../ai/apps";

export const QUESTION_IDS = [
  "why_company",
  "why_role",
  "proud_project",
  "availability",
  "salary",
  "english",
  "mobility",
  "why_you",
  "weaknesses",
] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];
export const isQuestionId = (s: unknown): s is QuestionId => typeof s === "string" && (QUESTION_IDS as readonly string[]).includes(s);

export const DEFAULT_MAX = 600;
export const MAX_LIMIT = 2000;
export const MIN_LIMIT = 80;
export const clampLimit = (n: unknown) => Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.round(Number(n)) || DEFAULT_MAX));

export const QUESTION_LABEL: Record<Locale, Record<QuestionId, string>> = {
  fr: {
    why_company: "Pourquoi notre entreprise ?",
    why_role: "Pourquoi ce stage / ce poste ?",
    proud_project: "Décrivez un projet dont vous êtes fier.",
    availability: "Vos disponibilités ?",
    salary: "Prétentions / gratification souhaitée ?",
    english: "Quel est votre niveau d'anglais ?",
    mobility: "Êtes-vous mobile ?",
    why_you: "Pourquoi vous ?",
    weaknesses: "Vos points faibles ?",
  },
  en: {
    why_company: "Why our company?",
    why_role: "Why this internship / role?",
    proud_project: "Describe a project you are proud of.",
    availability: "What is your availability?",
    salary: "Salary / stipend expectations?",
    english: "What is your level of English?",
    mobility: "Are you willing to relocate or travel?",
    why_you: "Why you?",
    weaknesses: "What are your weaknesses?",
  },
};

/** Always pre-selected: nearly every form asks them. */
const DEFAULT_ON: QuestionId[] = ["why_company", "why_role", "why_you"];

const DETECT: Record<QuestionId, RegExp> = {
  why_company: /pourquoi (notre|nous)|why (us|our company)|motivation/i,
  why_role: /pourquoi ce (stage|poste)|why this (role|internship|position)|lettre de motivation|cover letter|motivation/i,
  proud_project: /projet|project|portfolio|github|réalisation/i,
  availability: /disponib|availab|démarrage|start date|dès que possible|asap|immédiat|date de début|durée/i,
  salary: /gratification|salaire|rémunération|prétention|salary|stipend|compensation|DT\b|dinars|TND/i,
  english: /anglais|english|bilingu|toefl|toeic|ielts/i,
  mobility: /mobil|déplacement|relocat|travel|permis|driving licen[cs]e|sur site|on-site|onsite/i,
  why_you: /pourquoi vous|why you|why should we|profil recherché|what makes you/i,
  weaknesses: /points? faibles?|weakness|axes? d'amélioration|défauts?/i,
};

export interface DetectedQuestion {
  id: QuestionId;
  detected: boolean;
  selected: boolean;
}

/** Every bank question, flagged when the posting hints at it; defaults are pre-selected. */
export function detectQuestions(posting: string): DetectedQuestion[] {
  const text = posting || "";
  return QUESTION_IDS.map((id) => {
    const detected = DETECT[id].test(text);
    return { id, detected, selected: detected || DEFAULT_ON.includes(id) };
  });
}

// ---------- CV facts ----------
export interface CvFacts {
  name: string;
  headline: string;
  skills: string[]; // present in both CV/profile and posting
  ownSkills: string[]; // in CV/profile
  projects: string[]; // headings / bullets from project or experience sections
  languages: string[];
  locations: string[];
  english: "fluent" | "professional" | "intermediate" | null;
}

/** Project-like titles from "## Projets / Expériences / Stages" sections of the CV. */
export function cvProjects(cv: string): string[] {
  const heads: string[] = [];
  const bullets: string[] = [];
  let inside = false;
  for (const line of cv.split("\n")) {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      inside = /projet|project|exp[ée]rience|stage|internship|pfe/i.test(h2[1]);
      continue;
    }
    if (!inside) continue;
    const m = line.match(/^###\s+(.+)|^[-*]\s+\**([^*:–-]{4,80})/);
    const title = (m?.[1] ?? m?.[2])?.replace(/[*_`#]/g, "").trim().slice(0, 80);
    if (!title) continue;
    const bucket = m?.[1] ? heads : bullets;
    if (!bucket.includes(title)) bucket.push(title);
  }
  // "### Title" lines are projects; bullets are only used when a CV has no sub-headings.
  return (heads.length ? heads : bullets).slice(0, 6);
}

export function cvFacts(job: Job, profile: Profile, cvText: string): CvFacts {
  const own = extractSkills(`${profile.skills.join(", ")}\n${cvText}`);
  const posting = extractSkills(`${job.title}\n${job.tags.join(", ")}\n${job.description}`);
  const skills = own.filter((s) => posting.includes(s));
  const text = `${cvText}\n${profile.languages.join(" ")}`;
  const english = /anglais|english/i.test(text)
    ? /courant|fluent|bilingu|C1|C2|natif|native/i.test(text)
      ? "fluent"
      : /B2|professionnel|professional|avancé|advanced|toeic|toefl|ielts/i.test(text)
        ? "professional"
        : "intermediate"
    : null;
  return {
    name: profile.name,
    headline: profile.headline,
    skills,
    ownSkills: own,
    projects: cvProjects(cvText),
    languages: profile.languages,
    locations: profile.target_locations,
    english,
  };
}

// ---------- heuristic answers ----------
export interface AnswerCtx {
  job: Job;
  profile: Profile;
  cvText: string;
  locale: Locale;
  maxChars: number;
}

const TYPE = {
  fr: { stage: "stage", pfe: "PFE", emploi: "poste", alternance: "alternance", freelance: "mission" },
  en: { stage: "internship", pfe: "final-year project", emploi: "position", alternance: "work-study", freelance: "mission" },
} as const;

const list = (xs: string[], n: number) => xs.slice(0, n).join(", ");

export function heuristicAnswer(id: QuestionId, c: AnswerCtx, f = cvFacts(c.job, c.profile, c.cvText)): string {
  const { job } = c;
  const fr = c.locale === "fr";
  const kind = TYPE[c.locale][job.type];
  const skills = f.skills.length ? list(f.skills, 4) : list(f.ownSkills, 3);
  const proj = f.projects[0];
  const head = f.headline;
  let s: string;
  if (fr) {
    switch (id) {
      case "why_company":
        s = `${job.company} propose un ${kind} de ${job.title}${job.location ? ` à ${job.location}` : ""} qui correspond à ce que je recherche${skills ? ` : mettre en pratique ${skills}` : ""}. [Une phrase sur ce qui vous attire concrètement chez ${job.company}.]`;
        break;
      case "why_role":
        s = `Ce ${kind} de ${job.title} me permettrait d'appliquer${skills ? ` ${skills}` : " mes compétences"} dans un cadre professionnel${head ? `, en cohérence avec mon profil de ${head}` : ""}.${proj ? ` Mon projet « ${proj} » m'a donné envie d'aller plus loin sur ce type de sujets.` : ""}`;
        break;
      case "proud_project":
        s = proj
          ? `${proj}. [Contexte : objectif, équipe, durée.] [Votre rôle et les choix techniques${skills ? ` (${skills})` : ""}.] [Résultat mesurable.]`
          : `[Nom du projet]. [Contexte, votre rôle, technologies${skills ? ` : ${skills}` : ""}, résultat.] Ajoutez vos projets dans le CV pour une réponse pré-remplie.`;
        break;
      case "availability":
        s = `Je suis disponible [à partir du JJ/MM/AAAA] pour une durée de [N mois]${job.deadline ? `, et j'ai noté la date limite du ${job.deadline}` : ""}. Je peux m'adapter aux dates de démarrage souhaitées par ${job.company}.`;
        break;
      case "salary":
        s = `Je suis ouvert à une gratification conforme aux pratiques de ${job.company} pour un ${kind} de ${job.title}. [Indiquez une fourchette en DT si le formulaire l'exige, ou « à discuter ».]`;
        break;
      case "english":
        s =
          f.english === "fluent"
            ? "Anglais courant : je lis la documentation technique, échange et présente en anglais sans difficulté."
            : f.english === "professional"
              ? "Niveau professionnel (B2) : à l'aise à l'écrit et à l'oral dans un contexte technique."
              : "Niveau intermédiaire : je lis la documentation technique en anglais et je progresse à l'oral. [Précisez un score TOEIC/TOEFL si disponible.]";
        break;
      case "mobility":
        s = `${job.remote ? "Le télétravail me convient parfaitement, et je" : "Je"} suis mobile${job.location ? ` sur ${job.location}` : ""}${f.locations.length ? ` ainsi que ${list(f.locations, 3)}` : ""}. [Précisez permis / déplacements possibles.]`;
        break;
      case "why_you":
        s = `${head ? `${head}, j` : "J"}e maîtrise ${skills || "[compétences clés]"}, exactement ce que demande le ${kind} de ${job.title}.${proj ? ` J'ai déjà mené « ${proj} » de bout en bout.` : ""} Je suis rigoureux, autonome et je m'intègre vite dans une équipe.`;
        break;
      case "weaknesses":
        s = `Je peux être perfectionniste sur les détails techniques ; j'ai appris à me fixer des limites de temps et à livrer par itérations. [Un deuxième axe d'amélioration sincère, avec ce que vous faites pour progresser.]`;
        break;
    }
  } else {
    switch (id) {
      case "why_company":
        s = `${job.company} offers a ${job.title} ${kind}${job.location ? ` in ${job.location}` : ""} that matches what I am looking for${skills ? `: applying ${skills} in practice` : ""}. [One sentence on what concretely attracts you to ${job.company}.]`;
        break;
      case "why_role":
        s = `This ${job.title} ${kind} would let me apply${skills ? ` ${skills}` : " my skills"} in a professional setting${head ? `, in line with my profile as ${head}` : ""}.${proj ? ` My project "${proj}" made me want to go further on this kind of work.` : ""}`;
        break;
      case "proud_project":
        s = proj
          ? `${proj}. [Context: goal, team, duration.] [Your role and technical choices${skills ? ` (${skills})` : ""}.] [Measurable result.]`
          : `[Project name]. [Context, your role, technologies${skills ? `: ${skills}` : ""}, result.] Add projects to your CV to get a pre-filled answer.`;
        break;
      case "availability":
        s = `I am available [from DD/MM/YYYY] for [N months]${job.deadline ? `, and I noted the ${job.deadline} deadline` : ""}. I can adapt to the start date ${job.company} prefers.`;
        break;
      case "salary":
        s = `I am open to a stipend in line with ${job.company}'s practice for a ${job.title} ${kind}. [Give a range in DT if the form requires one, or "to be discussed".]`;
        break;
      case "english":
        s =
          f.english === "fluent"
            ? "Fluent: I read technical documentation, discuss and present in English without difficulty."
            : f.english === "professional"
              ? "Professional level (B2): comfortable in writing and speaking in a technical context."
              : "Intermediate: I read technical documentation in English and keep improving my speaking. [Add a TOEIC/TOEFL score if you have one.]";
        break;
      case "mobility":
        s = `${job.remote ? "Remote work suits me well, and I" : "I"} am mobile${job.location ? ` for ${job.location}` : ""}${f.locations.length ? ` as well as ${list(f.locations, 3)}` : ""}. [Mention driving licence / travel if relevant.]`;
        break;
      case "why_you":
        s = `${head ? `As ${head}, I` : "I"} work with ${skills || "[key skills]"}, which is exactly what the ${job.title} ${kind} asks for.${proj ? ` I have already carried "${proj}" end to end.` : ""} I am rigorous, autonomous and quick to integrate in a team.`;
        break;
      case "weaknesses":
        s = `I can be a perfectionist on technical details; I have learned to time-box and ship in iterations. [A second honest improvement area, with what you do about it.]`;
        break;
    }
  }
  return clampChars(s, c.maxChars);
}

/** Custom (user-typed) question: a grounded scaffold the user completes. */
export function heuristicCustomAnswer(question: string, c: AnswerCtx, f = cvFacts(c.job, c.profile, c.cvText)): string {
  const fr = c.locale === "fr";
  const skills = list(f.skills.length ? f.skills : f.ownSkills, 3);
  const s = fr
    ? `[Réponse à « ${question} »] En lien avec le poste de ${c.job.title} chez ${c.job.company}${skills ? `, je peux m'appuyer sur ${skills}` : ""}. [Un exemple concret tiré de votre CV${f.projects[0] ? ` (ex. ${f.projects[0]})` : ""}.]`
    : `[Answer to "${question}"] For the ${c.job.title} role at ${c.job.company}${skills ? `, I can build on ${skills}` : ""}. [One concrete example from your CV${f.projects[0] ? ` (e.g. ${f.projects[0]})` : ""}.]`;
  return clampChars(s, c.maxChars);
}
