// Form-field artifacts: a self-introduction in three lengths, project entries, pitch variants.
// Lengths are enforced programmatically; the deterministic builder uses CV facts only.
import type { Job, Locale, Profile } from "../types";
import { clampChars, cvFacts, cvProjects } from "./questions";
import { extractSkills } from "../ai/heuristic";

export const INTRO_LENGTHS = [150, 300, 600] as const;
export const PROJECT_MAX = 400;
export const PITCH_MAX = 220;

export interface FormFields {
  intros: { max: number; text: string }[];
  projects: { title: string; stack: string; result: string; text: string }[];
  pitches: string[];
  engine: string;
  created_at: string;
}

const TYPE = {
  fr: { stage: "stage", pfe: "PFE", emploi: "poste", alternance: "alternance", freelance: "mission" },
  en: { stage: "internship", pfe: "final-year project", emploi: "position", alternance: "work-study", freelance: "mission" },
} as const;

/** "### Title" + following bullets (or a single bullet) from the project sections of the CV. */
export function projectBlocks(cv: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = [];
  let inside = false;
  let cur: { title: string; body: string } | null = null;
  for (const line of cv.split(/\r?\n/)) {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) { inside = /projet|project|exp[ée]rience|stage|internship|pfe/i.test(h2[1]); cur = null; continue; }
    if (!inside) continue;
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) { cur = { title: h3[1].replace(/[*_`#]/g, "").trim().slice(0, 80), body: "" }; out.push(cur); continue; }
    const bullet = line.match(/^[-*]\s+(.+)/);
    if (!bullet) continue;
    if (cur) cur.body += (cur.body ? " " : "") + bullet[1].replace(/[*_`]/g, "").trim();
    else {
      const [title, ...rest] = bullet[1].replace(/[*_`]/g, "").split(/\s[—–-]\s|:\s/);
      out.push({ title: title.trim().slice(0, 80), body: rest.join(" ").trim() });
    }
  }
  return out.slice(0, 4);
}

/** Enforce every length limit (also applied to model output). */
export function enforceLimits(f: Omit<FormFields, "engine" | "created_at">): Omit<FormFields, "engine" | "created_at"> {
  return {
    intros: INTRO_LENGTHS.map((max) => ({ max, text: clampChars((f.intros.find((i) => i.max === max)?.text ?? f.intros[0]?.text ?? "").trim(), max) })),
    projects: f.projects.slice(0, 3).map((p) => {
      const text = clampChars((p.text || `${p.title} · ${p.stack} · ${p.result}`).trim(), PROJECT_MAX);
      return { title: p.title.slice(0, 80), stack: p.stack.slice(0, 120), result: p.result.slice(0, 200), text };
    }),
    pitches: f.pitches.map((p) => clampChars(p.trim(), PITCH_MAX)).filter(Boolean).slice(0, 6),
  };
}

export function heuristicFields(job: Job, profile: Profile, cvText: string, locale: Locale): FormFields {
  const fr = locale === "fr";
  const f = cvFacts(job, profile, cvText);
  const kind = TYPE[locale][job.type];
  const skills = f.skills.length ? f.skills : f.ownSkills;
  const head = f.headline || (fr ? "élève ingénieur à l'ENIT" : "engineering student at ENIT");
  const blocks = projectBlocks(cvText);
  const proj = blocks[0]?.title ?? cvProjects(cvText)[0];
  const sk = (n: number) => skills.slice(0, n).join(", ");

  const long = fr
    ? `${head}. Je postule au ${kind} de ${job.title} chez ${job.company}. ${sk(4) ? `Je travaille avec ${sk(4)}` : "[Compétences clés]"}${proj ? `, notamment sur « ${proj} »` : ""}. ${blocks[1] ? `J'ai aussi mené « ${blocks[1].title} ». ` : ""}Je cherche à mettre ces compétences au service de vos projets et à progresser dans une équipe exigeante. [Une phrase sur ce qui vous attire chez ${job.company}.]`
    : `${head}. I am applying for the ${job.title} ${kind} at ${job.company}. ${sk(4) ? `I work with ${sk(4)}` : "[Key skills]"}${proj ? `, notably on “${proj}”` : ""}. ${blocks[1] ? `I also carried “${blocks[1].title}”. ` : ""}I want to put these skills to work on your projects and grow in a demanding team. [One sentence on what attracts you to ${job.company}.]`;
  const mid = fr
    ? `${head}, je postule au ${kind} de ${job.title} chez ${job.company}. ${sk(3) ? `Compétences : ${sk(3)}` : "[Compétences clés]"}${proj ? ` ; projet marquant : « ${proj} »` : ""}.`
    : `${head}, applying for the ${job.title} ${kind} at ${job.company}. ${sk(3) ? `Skills: ${sk(3)}` : "[Key skills]"}${proj ? `; standout project: “${proj}”` : ""}.`;
  const short = fr ? `${head} — ${sk(3) || "[compétences]"} — candidat au ${kind} de ${job.title}.` : `${head} — ${sk(3) || "[skills]"} — applying for the ${job.title} ${kind}.`;

  const projects = blocks.map((b) => {
    const stack = extractSkills(`${b.title} ${b.body}`).slice(0, 5).join(", ");
    const result = b.body ? clampChars(b.body, 200) : fr ? "[Résultat mesurable]" : "[Measurable result]";
    return { title: b.title, stack: stack || (fr ? "[technologies]" : "[stack]"), result, text: `${b.title} · ${stack || (fr ? "[technologies]" : "[stack]")} · ${result}` };
  });

  const pitches = fr
    ? [
        `Je suis ${head} et je cherche un ${kind} où appliquer ${sk(2) || "[compétences]"}.`,
        `${job.title} chez ${job.company} : exactement le type de ${kind} où mes projets${proj ? ` (« ${proj} »)` : ""} prennent tout leur sens.`,
        `${sk(3) || "[compétences]"} : des compétences que j'ai construites en projet et que je veux consolider chez ${job.company}.`,
        `Rigoureux et autonome, je livre par itérations ; mon projet${proj ? ` « ${proj} »` : ""} en est la preuve.`,
      ]
    : [
        `I am ${head}, looking for a ${kind} where I can apply ${sk(2) || "[skills]"}.`,
        `${job.title} at ${job.company}: exactly the kind of ${kind} where my projects${proj ? ` (“${proj}”)` : ""} make sense.`,
        `${sk(3) || "[skills]"}: skills I built on projects and want to consolidate at ${job.company}.`,
        `Rigorous and autonomous, I ship in iterations; my project${proj ? ` “${proj}”` : ""} is the proof.`,
      ];

  return { ...enforceLimits({ intros: [{ max: 600, text: long }, { max: 300, text: mid }, { max: 150, text: short }], projects, pitches }), engine: "heuristic", created_at: new Date().toISOString() };
}
