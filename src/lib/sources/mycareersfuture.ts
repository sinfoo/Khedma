// MyCareersFuture, Singapore's government job portal (Workforce Singapore): the public JSON API its own search page calls
// (observed 2026-10-31, no key). The API host has no robots.txt; the site's allows every agent but Meta's.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, matchesKeywords, normalizeDate } from "./classify";
import { htmlToText } from "./html";
import { getJson } from "./http";

interface McfJob {
  title?: string;
  description?: string; // HTML
  skills?: { skill?: string }[];
  employmentTypes?: { employmentType?: string }[]; // "Internship/Attachment", "Full Time", "Contract" …
  positionLevels?: { position?: string }[];
  postedCompany?: { name?: string };
  hiringCompany?: { name?: string } | null; // the employer when an agency posts
  address?: { districts?: { region?: string }[] };
  metadata?: { jobDetailsUrl?: string; newPostingDate?: string; expiryDate?: string };
  salary?: { minimum?: number; maximum?: number; type?: { salaryType?: string } };
}
export interface McfPayload { total?: number; results?: McfJob[] }

export const mcfUrl = (search: string) => `https://api.mycareersfuture.gov.sg/v2/jobs?${new URLSearchParams({ search, limit: "50", page: "0" })}`;

const sgd = (n: number) => `S$${n.toLocaleString("en-US")}`;
const PER: Record<string, string> = { Monthly: "month", Annually: "year", Yearly: "year", Hourly: "hour", Daily: "day" };

export function mapMcf(json: McfPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.results ?? []) {
    const url = j.metadata?.jobDetailsUrl;
    if (!j.title || !url) continue;
    const title = j.title.trim();
    const kinds = (j.employmentTypes ?? []).map((e) => e.employmentType).filter(Boolean).join(", ");
    const s = j.salary;
    const pay = s?.minimum || s?.maximum ? `Salary: ${[s.minimum, s.maximum].filter((n): n is number => !!n).map(sgd).join(" – ")} / ${PER[s.type?.salaryType ?? ""] ?? "month"}` : "";
    const skills = (j.skills ?? []).map((x) => x.skill).filter(Boolean).join(", ");
    const level = j.positionLevels?.[0]?.position;
    const body = htmlToText(j.description ?? "");
    const description = [[pay, kinds, level].filter(Boolean).join(" · "), body, skills && `Skills: ${skills}`].filter(Boolean).join("\n\n");
    const region = j.address?.districts?.[0]?.region;
    out.push({
      title,
      company: (j.hiringCompany?.name || j.postedCompany?.name || "MyCareersFuture").trim(),
      location: region ? `${region}, Singapore` : "Singapore",
      remote: guessRemote(`${title} ${body.slice(0, 400)}`),
      url,
      source: "mycareersfuture" as SourceKind,
      type: guessType(`${title} ${kinds}`, body),
      description,
      tags: extractTags(title, `${body} ${skills}`),
      posted_at: normalizeDate(j.metadata?.newPostingDate),
      deadline: normalizeDate(j.metadata?.expiryDate),
    });
  }
  return out;
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const terms = keywords.length ? keywords.slice(0, 3) : ["intern"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const { data, error: e } = await getJson<McfPayload>(mcfUrl(kw));
    if (data) jobs.push(...mapMcf(data));
    else error = e;
  }
  // Results are ranked on the whole posting; keep offers whose title carries a keyword word.
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  return { jobs: jobs.filter((j) => matchesKeywords(j.title, words)), error: jobs.length ? undefined : error };
}
