"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ensureApplication,
  getJob,
  getProfile,
  latestEvaluation,
  updateJob,
  upsertJob,
  type NewJob,
} from "@/lib/db";
import { JOB_TYPES, type Evaluation, type Job, type JobType, type Profile, type Triage } from "@/lib/types";
import { evaluateJob } from "@/lib/ai";
import { heuristicEvaluateV2 } from "@/lib/ai/eval-v2";
import { eligibilityGates } from "@/lib/ai/gates";
import { triageScore } from "@/lib/ai/triage";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { isBlacklisted } from "@/lib/company";
import { getTriageMarginals, insertEvaluationV2, isPriorityCompany, setTriageMarginals as setMarginals } from "@/lib/repo/evaluations";
import { DEMO_JOBS, extractTags, guessType, importFromUrl } from "@/lib/sources";
import * as repo from "@/lib/repo/offers";
import { bestPicks, type Pick } from "@/lib/picks";

const str = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);
/** Trust boundary for id lists coming from the client. */
const cleanIds = (ids: unknown): number[] =>
  Array.isArray(ids) ? [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500) : [];
const refresh = () => revalidatePath("/app", "layout");

function jobFromForm(fd: FormData): NewJob | { error: string } {
  const title = str(fd.get("title"), 200);
  const company = str(fd.get("company"), 200);
  const description = str(fd.get("description"), 20_000);
  let url = str(fd.get("url"), 1000);
  if (!title || !company) return { error: "missing" };
  if (url && !/^https?:\/\//i.test(url)) return { error: "url" };
  if (!url) url = `manual://${encodeURIComponent(company)}/${encodeURIComponent(title)}/${Date.now()}`;
  const typeRaw = str(fd.get("type"), 20);
  const type: JobType = (JOB_TYPES as string[]).includes(typeRaw) ? (typeRaw as JobType) : guessType(title, description);
  const tags = str(fd.get("tags"), 500)
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  const deadline = str(fd.get("deadline"), 10);
  return {
    title,
    company,
    location: str(fd.get("location"), 200),
    remote: fd.get("remote") === "on",
    url,
    source: url.startsWith("manual://") ? "manual" : "url",
    type,
    description,
    tags: tags.length ? tags : extractTags(title, description),
    posted_at: null,
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null,
  };
}

export type SaveResult = { error?: string; duplicate?: number } | null;

export async function createJob(_prev: SaveResult, fd: FormData): Promise<SaveResult> {
  const j = jobFromForm(fd);
  if ("error" in j) return { error: j.error };
  const { id, inserted } = upsertJob(j);
  if (!inserted) return { duplicate: id };
  refresh();
  redirect(`/app/jobs/${id}?new=1`);
}

export async function editJob(id: number, fd: FormData): Promise<SaveResult> {
  const j = jobFromForm(fd);
  if ("error" in j) return { error: j.error };
  try {
    updateJob(id, j);
  } catch {
    return { error: "url" }; // UNIQUE(url) clash with another offer
  }
  refresh();
  redirect(`/app/jobs/${id}`);
}

export async function fetchJobFromUrl(_prev: unknown, fd: FormData) {
  const url = str(fd.get("url"), 1000);
  if (!url) return { error: "missing" };
  const r = await importFromUrl(url);
  if (r.error || !r.job) return { error: r.error ?? "fetch" };
  return { job: r.job };
}

export async function parsePasted(text: string): Promise<repo.PastedOffer> {
  return repo.parsePastedOffer(String(text ?? "").slice(0, 20_000));
}

/** Full evaluation (single-offer "Evaluate": never gated by triage). The triage line is stored for information. */
async function fullEvaluation(job: Job, profile: Profile): Promise<Evaluation> {
  const gates = eligibilityGates(job, profile, getProfileExtra().langs);
  const triage = triageScore(job, profile, { gates });
  return insertEvaluationV2({ ...(await evaluateJob(job, profile, gates)), triage });
}

export async function runEvaluation(jobId: number) {
  const job = getJob(Number(jobId));
  if (!job) return;
  await fullEvaluation(job, getProfile());
  refresh();
}

export async function setTriageMarginals(on: boolean) {
  setMarginals(!!on);
  refresh();
}

export type BulkEvalResult = { ok: boolean; global?: number; verdict?: Evaluation["verdict"]; engine?: string; triaged?: Triage };

/**
 * Bulk path ("Evaluate new", selections): one offer at a time so the client can show progress; no revalidation.
 * Rules first: an offer with no evaluation yet goes through the zero-LLM triage gate. FAIL (or a MARGINAL when
 * "also evaluate marginals" is off) stores a heuristic evaluation tagged with the triage reason instead of
 * calling the model. Starred offers and companies already tracked/rated always pass. Re-evaluations are never gated.
 */
export async function evaluateOffer(jobId: number): Promise<BulkEvalResult> {
  const job = getJob(Number(jobId));
  if (!job) return { ok: false };
  const profile = getProfile();
  try {
    if (!latestEvaluation(job.id) && !isPriorityCompany(job)) {
      const gates = eligibilityGates(job, profile, getProfileExtra().langs);
      const triage = triageScore(job, profile, { gates });
      if (isBlacklisted(job.company)) {
        triage.verdict = "fail";
        triage.reason = `${profile.settings.locale === "fr" ? "entreprise sur votre liste noire" : "company on your blacklist"} · ${triage.reason}`;
      }
      const skip = triage.verdict === "fail" || (triage.verdict === "marginal" && !getTriageMarginals());
      if (skip) {
        const ev = insertEvaluationV2({ job_id: job.id, ...heuristicEvaluateV2(job, profile), triage: { ...triage, skipped: true } });
        return { ok: true, global: ev.global, verdict: ev.verdict, engine: ev.engine, triaged: ev.triage };
      }
    }
    const ev = await fullEvaluation(job, profile);
    return { ok: true, global: ev.global, verdict: ev.verdict, engine: ev.engine, triaged: ev.triage };
  } catch (e) {
    console.warn("[offers] evaluation failed:", (e as Error).message);
    return { ok: false };
  }
}

export async function trackJob(jobId: number) {
  const app = ensureApplication(Number(jobId));
  refresh();
  redirect(`/app/pipeline/${app.id}`);
}

/** "Apply": track if needed, then open the workspace on its review & apply step. */
export async function applyTo(jobId: number) {
  if (!getJob(Number(jobId))) return;
  const app = ensureApplication(Number(jobId));
  refresh();
  redirect(`/app/pipeline/${app.id}?tab=overview`);
}

/** Track if needed, then open the application's documents tab for CV tailoring. */
export async function tailorCvFor(jobId: number) {
  if (!getJob(Number(jobId))) return;
  const app = ensureApplication(Number(jobId));
  refresh();
  redirect(`/app/pipeline/${app.id}?tab=documents`);
}

/** The post-scan shortlist: best open, untracked offers, this scan's and older ones together. */
export async function scanPicks(ids: number[]): Promise<Pick[]> {
  return bestPicks(cleanIds(ids));
}

export async function trackOffers(ids: number[]) {
  const ok = cleanIds(ids).filter((id) => getJob(id));
  for (const id of ok) ensureApplication(id);
  refresh();
  return ok.length;
}

export async function starOffers(ids: number[], starred: boolean) {
  const ok = cleanIds(ids);
  for (const id of ok) updateJob(id, { starred: !!starred });
  refresh();
  return ok.length;
}

export async function archiveOffers(ids: number[], archived: boolean) {
  const ok = cleanIds(ids);
  for (const id of ok) updateJob(id, { archived: !!archived });
  refresh();
  return ok.length;
}

export async function deleteOffers(ids: number[]): Promise<{ n: number; token: string | null }> {
  const ok = cleanIds(ids);
  if (!ok.length) return { n: 0, token: null };
  const token = repo.deleteWithUndo(ok);
  refresh();
  return { n: ok.length, token };
}

export async function undoDelete(token: string) {
  const n = repo.restoreDeleted(String(token ?? "").slice(0, 64));
  refresh();
  return n;
}

export async function saveOfferView(name: string, query: string) {
  const n = String(name ?? "").trim().slice(0, 40);
  if (!n) return null;
  const v = repo.saveView(n, repo.filtersToQuery(repo.parseFilters(new URLSearchParams(String(query ?? "")))));
  refresh();
  return v;
}

export async function deleteOfferView(id: string) {
  repo.deleteView(String(id ?? "").slice(0, 20));
  refresh();
}

export async function loadDemoJobs() {
  let n = 0;
  for (const j of DEMO_JOBS) if (upsertJob(j).inserted) n++;
  refresh();
  return n;
}
