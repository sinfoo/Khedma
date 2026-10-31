// jobs.ly, Libya's job portal: its free, documented read-only API (https://jobs.ly/en/developers, OpenAPI at
// /api/v1/openapi.json, checked 2026-10-31). No key, 120 requests a minute, robots.txt allows /api/v1/.
// Its one term: link each job to its jobs.ly page, where people apply. `url` is always that page.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessType, matchesKeywords, normalizeDate } from "./classify";
import { getJson } from "./http";

type Both = { ar?: string; en?: string };
interface JobslyJob {
  id?: string;
  url?: Both;
  title?: Both;
  company?: { name?: Both };
  city?: Both | null;
  category?: Both | null;
  jobType?: { code?: string } & Both | null; // full_time | part_time | internship …
  workMode?: { code?: string } | null; // onsite | hybrid | remote
  experienceLevel?: { code?: string } & Both | null;
  salary?: { formatted?: Both; period?: string | null } | null;
  postedAt?: string;
  expiresAt?: string;
}
export interface JobslyPayload { meta?: { total?: number }; data?: JobslyJob[] }
interface JobslyDetail { data?: { description?: Both; requirements?: { en?: string[]; ar?: string[] } } }

const API = "https://jobs.ly/api/v1/jobs";
export const jobslyUrl = (q: string) => `${API}?${new URLSearchParams({ q, perPage: "50", page: "1" })}`;
/** English first; the Arabic text when a job has no English one. */
const pick = (b?: Both | null) => (b?.en || b?.ar || "").trim();

export function mapJobsly(json: JobslyPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.data ?? []) {
    const title = pick(j.title);
    const url = j.url?.en || j.url?.ar;
    if (!title || !url) continue;
    const pay = j.salary?.formatted?.en ? `Salary: ${j.salary.formatted.en}${j.salary.period ? ` / ${j.salary.period}` : ""}` : "";
    const level = j.experienceLevel?.code === "unspecified" ? "" : pick(j.experienceLevel);
    const description = [pay, pick(j.jobType), level, pick(j.category)].filter(Boolean).join(" · ");
    const city = pick(j.city);
    out.push({
      title,
      company: pick(j.company?.name) || "jobs.ly",
      location: city ? `${city}, Libya` : "Libya",
      remote: j.workMode?.code === "remote",
      url,
      source: "jobsly" as SourceKind,
      type: guessType(`${title} ${j.jobType?.code === "internship" ? "internship" : ""}`, description),
      description,
      tags: extractTags(title, pick(j.category)),
      posted_at: normalizeDate(j.postedAt),
      deadline: normalizeDate(j.expiresAt),
    });
  }
  return out;
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  // A small board (about 100 open jobs): no keyword lists them all.
  const terms = keywords.length ? keywords.slice(0, 3) : [""];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const { data, error: e } = await getJson<JobslyPayload>(jobslyUrl(kw));
    if (data) jobs.push(...mapJobsly(data));
    else error = e;
  }
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  return { jobs: jobs.filter((j) => matchesKeywords(j.title, words)), error: jobs.length ? undefined : error };
}

/** Full description and requirements from the API's job endpoint; the posting URL stays the jobs.ly page. */
export function jobslyDetailText(json: JobslyDetail): string {
  const d = json.data;
  const reqs = d?.requirements?.en?.length ? d.requirements.en : (d?.requirements?.ar ?? []);
  return [pick(d?.description), reqs.length ? `Requirements:\n${reqs.map((r) => `- ${r}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const id = /\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(job.url)?.[1];
  if (!id) return null;
  const { data } = await getJson<JobslyDetail>(`${API}/${id}`);
  const body = data ? jobslyDetailText(data) : "";
  return body ? { description: [job.description, body].filter(Boolean).join("\n\n") } : null;
}
