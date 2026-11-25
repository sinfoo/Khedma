import type { NewJob } from "../db";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { decodeEntities, htmlToText } from "./html";
import { getJson, prettySlug } from "./http";

interface GhJob {
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  content?: string; // HTML, itself entity-escaped
  updated_at?: string;
  first_published?: string;
  company_name?: string;
  application_deadline?: string | null;
}
export interface GhPayload {
  jobs?: GhJob[];
}

export function mapGreenhouse(json: GhPayload, slug: string): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.jobs ?? []) {
    if (!j.title || !j.absolute_url) continue;
    const description = htmlToText(decodeEntities(j.content ?? ""));
    const location = j.location?.name ?? "";
    out.push({
      title: j.title.trim(),
      company: j.company_name?.trim() || prettySlug(slug),
      location,
      remote: guessRemote(`${location} ${j.title}`) || guessRemote(description.slice(0, 600)),
      url: j.absolute_url,
      source: "greenhouse",
      type: guessType(j.title, description),
      description,
      tags: extractTags(j.title, description),
      posted_at: normalizeDate(j.first_published ?? j.updated_at),
      deadline: normalizeDate(j.application_deadline),
    });
  }
  return out;
}

export async function scan(handle: string): Promise<{ jobs: NewJob[]; error?: string }> {
  const slug = handle.trim().toLowerCase();
  // A large board (GitLab) sends every posting's full text in one answer of several MB: 10 s is not enough on a slow line.
  const { data, error } = await getJson<GhPayload>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`, { timeoutMs: 30_000 });
  if (!data) return { jobs: [], error };
  return { jobs: mapGreenhouse(data, slug) };
}
