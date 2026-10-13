// Discover data access: the candidate model (cached in kv) and the "for you" bundle. Stable exports for other areas.
import { db, getProfile, kvGet, kvSet, listApplications, listJobs, listSources, type JobWithMeta } from "../db";
import { getCvSource } from "../cv/source";
import { getProfileExtra } from "../cv/profile-extra";
import { refineCandidateModel } from "../ai/discover";
import { lastRunAt } from "../repo/sources";
import { buildCandidateModel, FIELDS, LEVELS, hashInputs, type CandidateModel, type Field, type Level } from "./profile-model";
import {
  recommendActions,
  recommendCompanies,
  recommendOffers,
  recommendRoles,
  recommendSkills,
  recommendSources,
  type ActionReco,
  type CompanyReco,
  type OfferReco,
  type RoleReco,
  type SkillReco,
  type SourceReco,
} from "./engine";

export type { CandidateModel, Field, Level } from "./profile-model";
export type { ActionReco, CompanyReco, OfferReco, Reason, RoleReco, SkillReco, SourceReco } from "./engine";
export { FIELDS, LEVELS };

const MODEL_VERSION = 2;
const MODEL_KEY = "discover:model";
const OVERRIDE_KEY = "discover:override";

export interface Override {
  field?: Field;
  level?: Level;
}

export function getOverride(): Override | null {
  const v = kvGet<Override | null>(OVERRIDE_KEY, null);
  if (!v) return null;
  const o: Override = {};
  if (v.field && (FIELDS as readonly string[]).includes(v.field)) o.field = v.field;
  if (v.level && (LEVELS as readonly string[]).includes(v.level)) o.level = v.level;
  return o.field || o.level ? o : null;
}

export function setOverride(o: Override | null): void {
  kvSet(OVERRIDE_KEY, o && (o.field || o.level) ? o : null);
  kvSet(MODEL_KEY, null);
}

export function clearModelCache(): void {
  kvSet(MODEL_KEY, null);
}

/** Candidate model from CV + profile. Cached by input hash; the AI pass runs once per change and never invents facts. */
export async function getCandidateModel(opts: { refine?: boolean } = {}): Promise<CandidateModel> {
  const profile = getProfile();
  const extra = getProfileExtra();
  const cvText = getCvSource().text;
  const override = getOverride();
  const input = {
    cvText,
    profile: {
      headline: profile.headline,
      skills: profile.skills,
      target_roles: profile.target_roles,
      target_locations: profile.target_locations,
      target_types: profile.target_types,
      languages: profile.languages,
    },
    extra: { level: extra.level, specialty: extra.specialty, city: extra.city, skill_levels: extra.skill_levels, langs: extra.langs, links: extra.links },
    override,
  };
  // MODEL_VERSION bumps invalidate cached models when the heuristics or the AI prompt change.
  const hash = hashInputs([MODEL_VERSION, input, profile.settings.provider, profile.settings.locale]);
  const cached = kvGet<{ hash: string; model: CandidateModel } | null>(MODEL_KEY, null);
  if (cached && cached.hash === hash && cached.model) return cached.model;

  const heuristic = buildCandidateModel(input);
  const model = opts.refine === false ? heuristic : await refineCandidateModel(heuristic, cvText, profile.settings, profile.settings.locale);
  const final = { ...model, hash };
  kvSet(MODEL_KEY, { hash, model: final });
  return final;
}

export interface ForYou {
  model: CandidateModel;
  offers: OfferReco[];
  actions: ActionReco[];
  skills: SkillReco[];
  roles: RoleReco[];
  sources: SourceReco[];
  companies: CompanyReco[];
  counts: { jobs: number; evaluated: number; tracked: number; sources: number };
  generatedAt: string;
}

function upcomingInterviews(): Map<number, string> {
  const rows = db()
    .prepare("SELECT application_id, MIN(starts_at) AS at FROM interviews WHERE starts_at >= ? GROUP BY application_id")
    .all(new Date().toISOString().slice(0, 16)) as { application_id: number; at: string }[];
  return new Map(rows.map((r) => [r.application_id, r.at]));
}

function lastContacts(): Map<number, string> {
  const rows = db()
    .prepare("SELECT application_id, MAX(created_at) AS at FROM events WHERE kind IN ('followup','status') GROUP BY application_id")
    .all() as { application_id: number; at: string }[];
  return new Map(rows.map((r) => [r.application_id, r.at]));
}

/** Everything the Discover page shows, in one call. */
export async function getForYou(limit = 12): Promise<ForYou> {
  const model = await getCandidateModel();
  const profile = getProfile();
  const jobs: JobWithMeta[] = listJobs();
  const now = Date.now();
  const all = recommendOffers(model, jobs.map((j) => ({ job: j, evaluation: j.evaluation, application: j.application })), { now, limit: 500, targetRoles: profile.target_roles });
  const offers = all.filter((o) => !o.tracked).slice(0, limit);
  const sources = listSources();
  const apps = listApplications();
  const interviews = upcomingInterviews();
  const contacts = lastContacts();
  const skills = recommendSkills(model, jobs.filter((j) => !j.evaluation || j.evaluation.verdict !== "skip"));
  const roles = recommendRoles(model, profile.target_roles);
  const actions = recommendActions(model, {
    now,
    hasCv: getCvSource().text.trim().length >= 50,
    offers: all,
    unevaluated: jobs.filter((j) => !j.evaluation).length,
    sources: sources.filter((s) => s.enabled).length,
    lastScanAt: lastRunAt(),
    targetRoles: profile.target_roles.length,
    applications: apps.map((a) => ({
      id: a.id,
      title: a.job.title,
      company: a.job.company,
      status: a.status,
      lastContactAt: contacts.get(a.id) ?? a.applied_at,
      interviewAt: interviews.get(a.id) ?? null,
    })),
    skills,
  });
  return {
    model,
    offers,
    actions,
    skills,
    roles,
    sources: recommendSources(model, sources),
    companies: recommendCompanies(all, model),
    counts: { jobs: jobs.length, evaluated: jobs.filter((j) => j.evaluation).length, tracked: apps.length, sources: sources.length },
    generatedAt: new Date().toISOString(),
  };
}
