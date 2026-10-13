"use server";

import { revalidatePath } from "next/cache";
import { getCompany, listCompanies, companyJobs, updateCompany } from "@/lib/company";
import { researchCompany as runResearch } from "@/lib/company/research";
import { checkJobs } from "@/lib/company/liveness";
import { validatePublicUrl } from "@/lib/sources/url";
import { listApplications, updateJob } from "@/lib/db";

const SLUG = /^[a-z0-9-]{1,80}$/;
const str = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);
const refresh = (slug?: string) => {
  revalidatePath("/app/companies");
  if (slug) revalidatePath(`/app/companies/${slug}`);
};

export async function rateCompany(slug: string, rating: number): Promise<void> {
  if (!SLUG.test(slug)) return;
  const r = Math.round(Number(rating));
  updateCompany(slug, { rating: Number.isFinite(r) ? Math.min(5, Math.max(0, r)) : 0 });
  refresh(slug);
}

export async function setBlacklist(slug: string, on: boolean, reason = ""): Promise<void> {
  if (!SLUG.test(slug)) return;
  updateCompany(slug, { blacklisted: !!on, blacklist_reason: on ? String(reason).trim().slice(0, 300) : "" });
  refresh(slug);
}

export type DetailsResult = { error?: "url" } | null;

export async function saveCompanyDetails(slug: string, _prev: DetailsResult, fd: FormData): Promise<DetailsResult> {
  if (!SLUG.test(slug)) return null;
  const website = str(fd.get("website"), 500);
  const careers_url = str(fd.get("careers_url"), 500);
  for (const u of [website, careers_url]) if (u && !validatePublicUrl(u).url) return { error: "url" };
  updateCompany(slug, {
    website,
    careers_url,
    sector: str(fd.get("sector"), 80),
    size: str(fd.get("size"), 60),
    hq: str(fd.get("hq"), 80),
    notes: str(fd.get("notes"), 10_000),
  });
  refresh(slug);
  return null;
}

export async function researchCompany(slug: string, force = false): Promise<{ ok: boolean; error?: string; engine?: string; cached?: boolean }> {
  if (!SLUG.test(slug) || !getCompany(slug)) return { ok: false, error: "not found" };
  const r = await runResearch(slug, !!force);
  refresh(slug);
  return { ok: !r.error, error: r.error, engine: r.company.research?.summary.engine, cached: r.cached };
}

/** Research the N companies with most open offers that have not been researched yet (sequential: polite). */
export async function researchTop(n = 5): Promise<{ done: number; failed: number }> {
  const todo = listCompanies()
    .filter((c) => !c.researched_at && !c.blacklisted)
    .slice(0, Math.min(10, Math.max(1, Math.round(Number(n)) || 5)));
  let done = 0;
  let failed = 0;
  for (const c of todo) {
    const r = await runResearch(c.slug);
    if (r.error) failed++;
    else done++;
  }
  refresh();
  return { done, failed };
}

export interface CheckSummary {
  open: number;
  closed: number;
  unknown: number;
  closedIds: number[];
  checked: number;
}

function summarize(results: { status: string; job_id: number }[]): CheckSummary {
  const s: CheckSummary = { open: 0, closed: 0, unknown: 0, closedIds: [], checked: results.length };
  for (const r of results) {
    if (r.status === "open") s.open++;
    else if (r.status === "closed") {
      s.closed++;
      s.closedIds.push(r.job_id);
    } else s.unknown++;
  }
  return s;
}

/** Liveness check for every non-archived offer with an application and a public URL. */
export async function checkTrackedOffers(): Promise<CheckSummary> {
  const ids = listApplications()
    .filter((a) => /^https?:\/\//i.test(a.job.url) && !a.job.archived)
    .map((a) => a.job_id)
    .slice(0, 200);
  const s = summarize(await checkJobs(ids));
  refresh();
  return s;
}

export async function checkCompanyOffers(slug: string): Promise<CheckSummary> {
  if (!SLUG.test(slug)) return { open: 0, closed: 0, unknown: 0, closedIds: [], checked: 0 };
  const ids = companyJobs(slug)
    .filter((j) => !j.archived && /^https?:\/\//i.test(j.url))
    .map((j) => j.id)
    .slice(0, 100);
  const s = summarize(await checkJobs(ids));
  refresh(slug);
  return s;
}

/** Archive offers reported closed (ids come from the client: validated). */
export async function archiveClosedOffers(ids: number[]): Promise<number> {
  const ok = Array.isArray(ids) ? [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500) : [];
  for (const id of ok) updateJob(id, { archived: true });
  revalidatePath("/app", "layout");
  return ok.length;
}
