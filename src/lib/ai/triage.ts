// Triage gate: a zero-LLM 0-100 score deciding whether a bulk evaluation is worth a model call.
// archetype 35% + comp 25% (unknown = neutral) + location 25% + CV skills 15% − 0.5/5 per soft flag.
// PASS ≥ 70, MARGINAL 55-69, FAIL < 55 (career-ops 3.5 / 3.0 on 5). Eligibility gates veto to FAIL.
import type { Job, Locale, Profile, Triage } from "../types";
import { extractSkills, heuristicEvaluate } from "./heuristic";
import { detectField } from "../recommend/profile-model";
import { extractSalaryMentions } from "../salaries";
import type { Gate } from "./gates";

export const TRIAGE_PASS = 70;
export const TRIAGE_MARGINAL = 55;

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tokens = (s: string) => fold(s).split(/[^\p{L}\p{N}+#]+/u).filter((t) => t.length > 2);
const jobText = (job: Job) => `${job.title}\n${job.tags.join(", ")}\n${job.description}`;

export function triageScore(job: Job, profile: Profile, opts: { gates?: Gate[]; locale?: Locale; now?: number } = {}): Triage {
  const locale = opts.locale ?? profile.settings.locale;
  const fr = locale === "fr";
  const text = jobText(job);
  const lc = fold(text);
  const reasons: string[] = [];

  // archetype / role (1-5)
  const jobField = detectField(text)?.field ?? null;
  const me = detectField(`${profile.headline}\n${profile.skills.join(" ")}\n${profile.cv_md}\n${profile.target_roles.join(" ")}`);
  const titleTok = new Set(tokens(job.title));
  const roleHit = profile.target_roles.length
    ? Math.max(0, ...profile.target_roles.map((r) => { const t = tokens(r); return t.length ? t.filter((x) => titleTok.has(x)).length / t.length : 0; }))
    : 0.5;
  let archetype = 3;
  if (jobField && me) archetype = jobField === me.field ? 5 : jobField === me.alt ? 3.5 : 1.5;
  archetype = Math.min(5, Math.max(1, archetype + (roleHit >= 0.5 ? 0.5 : roleHit === 0 && profile.target_roles.length ? -0.5 : 0)));
  const typeOk = !profile.target_types.length || profile.target_types.includes(job.type);
  if (!typeOk) archetype = Math.max(1, archetype - 1.5);
  if (archetype <= 2) reasons.push(fr ? `métier éloigné (${jobField ?? "?"})` : `distant field (${jobField ?? "?"})`);
  if (!typeOk) reasons.push(fr ? `type ${job.type} hors cibles` : `type ${job.type} not targeted`);

  // compensation (1-5), unknown = neutral
  let comp = 3;
  if (/non[- ]r[ée]mun[ée]r|unpaid|sans r[ée]mun[ée]ration|b[ée]n[ée]vol/.test(lc)) { comp = 1; reasons.push(fr ? "non rémunéré" : "unpaid"); }
  else if (extractSalaryMentions(text).length || /r[ée]mun[ée]r|gratification|salaire|salary|stipend|paid/.test(lc)) comp = 4;

  // location (1-5)
  const loc = fold(job.location);
  let location = 3.5;
  if (job.remote) location = 5;
  else if (!profile.target_locations.length) location = 3.5;
  else if (profile.target_locations.some((l) => loc.includes(fold(l)) || lc.includes(fold(l)))) location = 5;
  else if (!loc) location = 3;
  else { location = 1.5; reasons.push(fr ? `lieu ${job.location} hors de vos zones` : `${job.location} outside your places`); }

  // CV skills (1-5)
  const have = new Set([...profile.skills, ...extractSkills(`${profile.skills.join(", ")}\n${profile.cv_md}`)].map(fold));
  const jobSkills = extractSkills(text);
  const matched = jobSkills.filter((s) => have.has(fold(s)));
  const ratio = jobSkills.length ? matched.length / jobSkills.length : 0.5;
  const cv = Math.min(5, Math.max(1, 1 + 4 * Math.min(1, ratio * 1.25)));
  if (jobSkills.length >= 3 && ratio < 0.25) reasons.push(fr ? `${matched.length}/${jobSkills.length} compétences` : `${matched.length}/${jobSkills.length} skills`);

  // soft flags: −0.5 (on 5) each, reuse the heuristic flag detector
  const flags = heuristicEvaluate(job, profile).flags;
  let on5 = archetype * 0.35 + comp * 0.25 + location * 0.25 + cv * 0.15 - 0.5 * flags.length;
  if (flags.length) reasons.push(fr ? `${flags.length} signal(aux) d'alerte` : `${flags.length} red flag(s)`);
  on5 = Math.min(5, Math.max(0, on5));
  let score = Math.round(on5 * 20);
  let verdict: Triage["verdict"] = score >= TRIAGE_PASS ? "pass" : score >= TRIAGE_MARGINAL ? "marginal" : "fail";

  const veto = (opts.gates ?? []).find((g) => g.level === "fail");
  if (veto) {
    verdict = "fail";
    score = Math.min(score, 40);
    reasons.unshift(`${fr ? "critère éliminatoire" : "eligibility gate"}: “${veto.quote}”`);
  }
  const reason = reasons.length ? reasons.slice(0, 3).join(" · ") : fr ? `métier ${archetype.toFixed(1)}, lieu ${location.toFixed(1)}, compétences ${cv.toFixed(1)}` : `field ${archetype.toFixed(1)}, location ${location.toFixed(1)}, skills ${cv.toFixed(1)}`;
  return { score, verdict, reason: reason.slice(0, 240), skipped: false };
}
