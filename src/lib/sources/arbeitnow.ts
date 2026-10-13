// Arbeitnow (Germany): free public JSON job board API, 300 offers per page, full HTML descriptions.
// https://www.arbeitnow.com/api/job-board-api — robots.txt allows everything; the API asks not to abuse it.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, matchesKeywords, normalizeDate } from "./classify";
import { decodeEntities, htmlToText } from "./html";
import { getJson } from "./http";

interface ArbeitnowJob {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string; // HTML, entity-escaped
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number; // epoch seconds
}
export interface ArbeitnowPayload {
  data?: ArbeitnowJob[];
  links?: { next?: string | null };
}

export const arbeitnowUrl = (search: string, page = 1) => `https://www.arbeitnow.com/api/job-board-api?${new URLSearchParams({ search, page: String(page) })}`;

export function mapArbeitnow(json: ArbeitnowPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.data ?? []) {
    if (!j.title || !j.url) continue;
    const description = htmlToText(decodeEntities(j.description ?? ""));
    const location = j.location?.trim() || "Germany";
    const title = j.title.trim();
    out.push({
      title,
      company: j.company_name?.trim() || "Arbeitnow",
      location,
      remote: !!j.remote || guessRemote(`${title} ${location}`),
      url: j.url,
      source: "arbeitnow" as SourceKind,
      type: guessType(`${title} ${(j.job_types ?? []).join(" ")}`, description),
      description,
      tags: extractTags(title, description),
      posted_at: j.created_at ? normalizeDate(j.created_at * 1000) : null,
      deadline: null,
    });
  }
  return out;
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  // The API's search is fuzzy; one request per keyword, then keep titles containing any keyword word.
  const terms = keywords.length ? keywords.slice(0, 3) : ["praktikum"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const { data, error: e } = await getJson<ArbeitnowPayload>(arbeitnowUrl(kw));
    if (!data) {
      error = e;
      continue;
    }
    jobs.push(...mapArbeitnow(data));
  }
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  return { jobs: jobs.filter((j) => matchesKeywords(j.title, words)), error: jobs.length ? undefined : error };
}
