// Job-Room (arbeit.swiss, Switzerland): the public search API behind job-room.ch. JSON, no key needed.
// robots.txt only blocks the /job-search/ HTML pages; the API and the detail endpoint are open.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { decodeEntities } from "./html";
import { USER_AGENT } from "./http";

const SEARCH = "https://www.job-room.ch/jobadservice/api/jobAdvertisements/_search";
const DETAIL = "https://www.job-room.ch/jobadservice/api/jobAdvertisements/";

export interface JobRoomAd {
  id?: string;
  jobContent?: {
    externalUrl?: string | null;
    jobDescriptions?: { languageIsoCode?: string; title?: string; description?: string }[];
    company?: { name?: string; city?: string; countryIsoCode?: string };
    employment?: { permanent?: boolean | null; shortEmployment?: boolean; workloadPercentageMin?: string; workloadPercentageMax?: string };
    location?: { city?: string; cantonCode?: string; countryIsoCode?: string };
  };
  publication?: { startDate?: string; endDate?: string };
}
export type JobRoomPayload = { jobAdvertisement?: JobRoomAd }[];

const strip = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, "")).trim();

export function mapJobRoom(ads: JobRoomPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const { jobAdvertisement: ad } of ads) {
    const c = ad?.jobContent;
    const d = c?.jobDescriptions?.[0];
    if (!ad?.id || !d?.title) continue;
    const title = strip(d.title);
    const description = strip(d.description ?? "");
    const loc = c?.location;
    const location = [loc?.city, loc?.cantonCode].filter(Boolean).join(", ") + (loc?.countryIsoCode && loc.countryIsoCode !== "CH" ? ` (${loc.countryIsoCode})` : ", Switzerland");
    const e = c?.employment;
    const workload = e?.workloadPercentageMin && e.workloadPercentageMin !== e.workloadPercentageMax ? `${e.workloadPercentageMin}–${e.workloadPercentageMax}%` : e?.workloadPercentageMax ? `${e.workloadPercentageMax}%` : "";
    out.push({
      title,
      company: c?.company?.name?.trim() || "Job-Room",
      location,
      remote: guessRemote(`${title} ${description.slice(0, 300)}`),
      url: `https://www.job-room.ch/job-search/${ad.id}`,
      source: "jobroom" as SourceKind,
      type: guessType(title, description),
      description: [workload && `Workload: ${workload}`, description].filter(Boolean).join("\n\n"),
      tags: extractTags(title, description),
      posted_at: normalizeDate(ad.publication?.startDate),
      deadline: normalizeDate(ad.publication?.endDate),
    });
  }
  return out;
}

async function post<T>(url: string, body: unknown): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { error: `HTTP ${res.status} for ${url}` };
    return { data: (await res.json()) as T };
  } catch (e) {
    return { error: `${(e as Error).name === "TimeoutError" ? "Timeout" : "Network error"} for ${url}: ${(e as Error).message}` };
  }
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const terms = keywords.length ? keywords.slice(0, 4) : ["praktikum"];
  const { data, error } = await post<JobRoomPayload>(`${SEARCH}?page=0&size=50&sort=date_desc`, {
    keywords: terms,
    workloadPercentageMin: 10,
    workloadPercentageMax: 100,
    permanent: null,
    companyName: null,
    onlineSince: 60,
    professionCodes: [],
    communalCodes: [],
    cantonCodes: [],
    displayRestricted: false,
    euresDisplay: false,
  });
  if (!data) return { jobs: [], error };
  return { jobs: mapJobRoom(Array.isArray(data) ? data : []) };
}

/** The search result only carries a highlighted snippet; the detail endpoint has the full text. */
export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const id = job.url.split("/").pop();
  if (!id) return null;
  try {
    const res = await fetch(DETAIL + id, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const ad = (await res.json()) as JobRoomAd;
    const [mapped] = mapJobRoom([{ jobAdvertisement: ad }]);
    return mapped ? { description: mapped.description } : null;
  } catch {
    return null;
  }
}
