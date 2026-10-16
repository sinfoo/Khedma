// Likely interviewer concerns for one application, ranked by severity, each with a counter script.
// Deterministic: built from the evaluation's requirement table (or the posting's skills), the CV and
// the profile's targets. Counters quote CV lines verbatim or leave [placeholders]; nothing is invented.
// Idea from interview-coach-skill's `concerns` workflow (MIT, © 2026 Noam Segal).
import type { Evaluation, Job, Locale, Profile } from "../types";
import { extractSkills } from "../ai/heuristic";
import { cvFacts } from "../ai/coach";

export const SEVERITIES = ["dealbreaker", "significant", "minor"] as const;
export type Severity = (typeof SEVERITIES)[number];
export interface Concern {
  severity: Severity;
  concern: string;
  counter: string;
}

const LANGS: { re: RegExp; en: string; fr: string; have: RegExp }[] = [
  { re: /\b(english|anglais)\b/i, en: "English", fr: "anglais", have: /english|anglais/i },
  { re: /\b(german|allemand|deutsch)\b/i, en: "German", fr: "allemand", have: /german|allemand|deutsch/i },
  { re: /\b(italian|italien)\b/i, en: "Italian", fr: "italien", have: /italian|italien/i },
  { re: /\b(spanish|espagnol)\b/i, en: "Spanish", fr: "espagnol", have: /spanish|espagnol/i },
];

export function likelyConcerns(job: Job, profile: Profile, ev: Evaluation | null, locale: Locale): Concern[] {
  const fr = locale === "fr";
  const T = (en: string, f: string) => (fr ? f : en);
  const proof = (keys: string) => {
    const f = cvFacts(profile, keys, 1)[0];
    return f ? (fr ? `« ${f} »` : `"${f}"`) : T("[your closest project or course]", "[votre projet ou cours le plus proche]");
  };
  const gapCounter = (what: string) =>
    T(
      `Acknowledge it in one sentence, then bridge: "I haven't used ${what} in production. The closest thing I've done is ${proof(what)}. To close the gap I would [concrete plan, e.g. a weekend project or course, with a date]." Don't over-apologise and don't overclaim.`,
      `Reconnaissez-le en une phrase, puis faites le pont : « Je n'ai pas encore utilisé ${what} en production. Ce qui s'en rapproche le plus : ${proof(what)}. Pour combler l'écart, je [plan concret, ex. projet ou cours, avec une date]. » Ni excuses à répétition, ni exagération.`,
    );
  const out: Concern[] = [];

  // 1. requirement gaps (evaluation v2), else posting skills missing from the profile
  const reqs = ev?.requirements ?? [];
  if (reqs.length) {
    for (const r of reqs) {
      const major = r.importance === "critical" || r.importance === "high";
      if (r.met === "no" && (major || r.importance === "meaningful"))
        out.push({ severity: major ? "dealbreaker" : "significant", concern: T(`No evidence of: ${r.text}`, `Aucune preuve de : ${r.text}`), counter: gapCounter(r.text) });
      else if (r.met === "partial" && major)
        out.push({
          severity: "significant",
          concern: T(`Only partial evidence of: ${r.text}`, `Preuve partielle seulement : ${r.text}`),
          counter: T(
            `Lead with the proof you have (${r.proof ? `"${r.proof}"` : proof(r.text)}), give its scope honestly (size, duration, your part) and say what you would need to learn on day one.`,
            `Commencez par la preuve que vous avez (${r.proof ? `« ${r.proof} »` : proof(r.text)}), donnez honnêtement son ampleur (taille, durée, votre part) et dites ce que vous devrez apprendre dès le premier jour.`,
          ),
        });
    }
  } else {
    const have = new Set(profile.skills.map((s) => s.toLowerCase()));
    const missing = extractSkills(`${job.title}\n${job.tags.join(", ")}\n${job.description}`).filter((s) => !have.has(s.toLowerCase()));
    for (const s of missing.slice(0, 3))
      out.push({ severity: "significant", concern: T(`${s} is asked for and is not in your profile`, `${s} est demandé et absent de votre profil`), counter: gapCounter(s) });
  }

  // 2. years of experience asked for an early-career profile
  const years = Math.max(0, ...[...job.description.matchAll(/(?:^|[^\d+])(\d{1,2})\s*\+?\s*(?:ans|années|years|yrs)\b/gi)].map((m) => Number(m[1])).filter((n) => n <= 15));
  if (years >= 2)
    out.push({
      severity: years >= 5 ? "dealbreaker" : "significant",
      concern: T(`The posting asks for ${years}+ years of experience`, `L'offre demande ${years} ans d'expérience ou plus`),
      counter: T(
        `Don't argue the number. Show the equivalent: internships, final-year project and side projects add up, e.g. ${proof("project internship stage experience")}. Then name the one thing you'd deliver in your first 90 days.`,
        `Ne contestez pas le chiffre. Montrez l'équivalent : stages, PFE et projets personnels s'additionnent, par ex. ${proof("projet stage expérience internship")}. Puis citez ce que vous livreriez dans vos 90 premiers jours.`,
      ),
    });

  // 3. working language not in the profile
  const spoken = profile.languages.join(" ");
  for (const l of LANGS)
    if (l.re.test(job.description) && !l.have.test(spoken))
      out.push({
        severity: "significant",
        concern: T(`${l.en} is required and not listed in your languages`, `L'${l.fr} est requis et absent de vos langues`),
        counter: T(
          `State your real level with a reference point (certificate, course, documents you read), and offer to switch to ${l.en} for part of the interview.`,
          `Donnez votre niveau réel avec un repère (certificat, cours, documents lus) et proposez de passer en ${l.fr} pour une partie de l'entretien.`,
        ),
      });

  // 4. location outside the targets, on-site role
  const loc = job.location.toLowerCase();
  if (!job.remote && loc && profile.target_locations.length && !profile.target_locations.some((x) => loc.includes(x.toLowerCase()) || x.toLowerCase().includes(loc)))
    out.push({
      severity: "minor",
      concern: T(`On-site in ${job.location}, outside your target locations`, `Sur site à ${job.location}, hors de vos lieux cibles`),
      counter: T("Answer before they ask: your move or commute plan and your start date.", "Répondez avant qu'on vous le demande : votre plan de déménagement ou de trajet et votre date de début."),
    });

  // 5. role type outside the targets
  if (profile.target_types.length && !profile.target_types.includes(job.type))
    out.push({
      severity: "minor",
      concern: T("This type of position is not one you target: they may doubt your motivation", "Ce type de poste ne fait pas partie de vos cibles : on peut douter de votre motivation"),
      counter: T(
        `Have one specific reason ready for this role at ${job.company}, tied to the posting, not to the contract type.`,
        `Préparez une raison précise pour ce poste chez ${job.company}, liée à l'offre et non au type de contrat.`,
      ),
    });

  const rank = (s: Severity) => SEVERITIES.indexOf(s);
  return out.sort((a, b) => rank(a.severity) - rank(b.severity)).slice(0, 8);
}
