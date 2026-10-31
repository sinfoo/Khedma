// jobs.workable.com: Workable's public job search across every employer hosted on Workable, one country at a time
// (the endpoint its own search page calls, observed 2026-10-31). robots.txt allows /api/ (Content-Signal: search=yes,
// ai-input=yes, ai-train=no). The handle is a comma list of ISO codes ("ma,eg"); each becomes the country's search name.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { countryByCode } from "../geo";
import { extractTags, guessType, matchesKeywords, normalizeDate } from "./classify";
import { htmlToText } from "./html";
import { getJson, sleep } from "./http";

interface WorkableJob {
  title?: string;
  description?: string; // HTML
  requirementsSection?: string;
  benefitsSection?: string;
  employmentType?: string; // "Full time" | "Contract" | "Internship" …
  url?: string;
  locations?: string[]; // ["TELECOMMUTE", "Casablanca, Casablanca-Settat, Morocco"]
  location?: { city?: string; countryName?: string };
  created?: string;
  workplace?: string; // remote | hybrid | on_site
  company?: { title?: string };
}
export interface WorkableJobsPayload { totalSize?: number; jobs?: WorkableJob[] }

export const workableJobsUrl = (query: string, location: string) => `https://jobs.workable.com/api/v1/jobs?${new URLSearchParams({ query, location })}`;

export function mapWorkableJobs(json: WorkableJobsPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.jobs ?? []) {
    if (!j.title || !j.url) continue;
    const title = j.title.trim();
    const description = [j.description, j.requirementsSection, j.benefitsSection].map((h) => htmlToText(h ?? "")).filter(Boolean).join("\n\n");
    const places = (j.locations ?? []).filter((l) => l !== "TELECOMMUTE");
    const fallback = [j.location?.city, j.location?.countryName].filter(Boolean).join(", ");
    out.push({
      title,
      company: j.company?.title?.trim() || "Workable",
      location: places.join(" · ") || fallback,
      remote: j.workplace === "remote" || (j.locations ?? []).includes("TELECOMMUTE"),
      url: j.url,
      source: "workablejobs" as SourceKind,
      type: guessType(`${title} ${j.employmentType ?? ""}`, description),
      description,
      tags: extractTags(title, description),
      posted_at: normalizeDate(j.created),
      deadline: null,
    });
  }
  return out;
}

// ponytail: first page only, 8 countries x 2 keywords at most, 400 ms apart; follow nextPageToken if a country needs more.
export async function scan(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const places = handle.split(",").map((c) => countryByCode(c.trim().toUpperCase())?.search).filter((s): s is string => !!s).slice(0, 8);
  if (!places.length) return { jobs: [], error: "Workable: choose at least one country code (e.g. ma,eg)" };
  const terms = keywords.length ? keywords.slice(0, 2) : ["intern"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  let first = true;
  for (const place of places) {
    for (const kw of terms) {
      if (!first) await sleep(400);
      first = false;
      const { data, error: e } = await getJson<WorkableJobsPayload>(workableJobsUrl(kw, place));
      if (data) jobs.push(...mapWorkableJobs(data));
      else error = e;
    }
  }
  // The search matches words anywhere in the posting; keep offers whose title carries a keyword word.
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  return { jobs: jobs.filter((j) => matchesKeywords(j.title, words)), error: jobs.length ? undefined : error };
}
