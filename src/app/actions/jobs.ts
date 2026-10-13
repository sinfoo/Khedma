"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ensureApplication,
  getJob,
  getProfile,
  insertEvaluation,
  updateJob,
  upsertJob,
  type NewJob,
} from "@/lib/db";
import { JOB_TYPES, type Evaluation, type JobType } from "@/lib/types";
import { evaluateJob } from "@/lib/ai";
import { DEMO_JOBS, extractTags, guessType, importFromUrl } from "@/lib/sources";
import * as repo from "@/lib/repo/offers";

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

export async function runEvaluation(jobId: number) {
  const job = getJob(Number(jobId));
  if (!job) return;
  insertEvaluation(await evaluateJob(job, getProfile()));
  refresh();
}

/** One offer at a time so the client can show progress. No revalidation: the caller refreshes once at the end. */
export async function evaluateOffer(jobId: number): Promise<{ ok: boolean; global?: number; verdict?: Evaluation["verdict"]; engine?: string }> {
  const job = getJob(Number(jobId));
  if (!job) return { ok: false };
  try {
    const ev = insertEvaluation(await evaluateJob(job, getProfile()));
    return { ok: true, global: ev.global, verdict: ev.verdict, engine: ev.engine };
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

/** Track if needed, then open the application's documents tab for CV tailoring. */
export async function tailorCvFor(jobId: number) {
  if (!getJob(Number(jobId))) return;
  const app = ensureApplication(Number(jobId));
  refresh();
  redirect(`/app/pipeline/${app.id}?tab=documents`);
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
