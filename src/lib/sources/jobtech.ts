// Sweden's open job APIs from JobTech Dev (Arbetsförmedlingen), no key:
// JobSearch = Platsbanken's own ads (deadline, contract, experience); JobAd Links = ads gathered from other Swedish boards.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, matchesKeywords, normalizeDate } from "./classify";
import { getJson } from "./http";

type Label = { label?: string | null } | null;
interface JsHit {
  id?: string;
  headline?: string;
  webpage_url?: string;
  publication_date?: string;
  application_deadline?: string | null;
  description?: { text?: string | null };
  employer?: { name?: string | null; workplace?: string | null };
  workplace_address?: { municipality?: string | null; region?: string | null; city?: string | null } | null;
  employment_type?: Label;
  duration?: Label;
  working_hours_type?: Label;
  workplace_model?: Label;
  experience_required?: boolean;
}
export interface JobSearchPayload { total?: { value?: number }; hits?: JsHit[] }

interface LinksHit {
  id?: string;
  headline?: string;
  brief?: string;
  employer?: { name?: string | null };
  workplace_addresses?: { municipality?: string | null; region?: string | null }[];
  publication_date?: string;
  source_links?: { label?: string; url?: string }[];
}
export interface JobLinksPayload { total?: { value?: number }; hits?: LinksHit[] }

export const jobSearchUrl = (q: string) => `https://jobsearch.api.jobtechdev.se/search?${new URLSearchParams({ q, limit: "100" })}`;
export const jobLinksUrl = (q: string) => `https://links.api.jobtechdev.se/joblinks?${new URLSearchParams({ q, limit: "100" })}`;

const place = (a?: { municipality?: string | null; region?: string | null; city?: string | null } | null) =>
  [a?.municipality || a?.city || a?.region, "Sweden"].filter(Boolean).join(", ");

export function mapJobSearch(json: JobSearchPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.hits ?? []) {
    if (!j.headline || !j.webpage_url) continue;
    const title = j.headline.trim();
    const body = j.description?.text?.trim() ?? "";
    const terms = [j.employment_type?.label, j.duration?.label, j.working_hours_type?.label].filter(Boolean).join(" · ");
    const head = [
      terms && `Terms: ${terms}`,
      j.workplace_model?.label && `Workplace: ${j.workplace_model.label}`,
      j.experience_required === false ? "No experience required" : "",
    ].filter(Boolean).join("\n");
    const description = [head, body].filter(Boolean).join("\n\n");
    out.push({
      title,
      company: j.employer?.name?.trim() || j.employer?.workplace?.trim() || "Arbetsförmedlingen",
      location: place(j.workplace_address),
      remote: /distans|remote/i.test(j.workplace_model?.label ?? "") || guessRemote(`${title} ${body.slice(0, 400)}`),
      url: j.webpage_url,
      source: "jobtech" as SourceKind,
      type: guessType(`${title} ${j.employment_type?.label ?? ""}`, body),
      description,
      tags: extractTags(title, body),
      posted_at: normalizeDate(j.publication_date),
      deadline: normalizeDate(j.application_deadline),
    });
  }
  return out;
}

export function mapJobLinks(json: JobLinksPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.hits ?? []) {
    const url = j.source_links?.[0]?.url;
    if (!j.headline || !url) continue;
    const title = j.headline.trim();
    const description = [j.brief?.trim(), j.source_links?.[0]?.label && `Posted on ${j.source_links[0].label}`].filter(Boolean).join("\n\n");
    out.push({
      title,
      company: j.employer?.name?.trim() || j.source_links?.[0]?.label || "JobTech",
      location: place(j.workplace_addresses?.[0]),
      remote: guessRemote(`${title} ${j.brief ?? ""}`),
      url,
      source: "jobtech" as SourceKind,
      type: guessType(title, j.brief ?? ""),
      description,
      tags: extractTags(title, j.brief ?? ""),
      posted_at: normalizeDate(j.publication_date),
      deadline: null,
    });
  }
  return out;
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const terms = keywords.length ? keywords.slice(0, 3) : ["praktikant"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const [a, b] = await Promise.all([getJson<JobSearchPayload>(jobSearchUrl(kw)), getJson<JobLinksPayload>(jobLinksUrl(kw))]);
    if (a.data) jobs.push(...mapJobSearch(a.data));
    else error = a.error;
    if (b.data) jobs.push(...mapJobLinks(b.data));
    else error = b.error;
  }
  // Free-text search matches the whole ad; keep offers whose title carries a keyword word.
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  return { jobs: jobs.filter((j) => matchesKeywords(j.title, words)), error: jobs.length ? undefined : error };
}
