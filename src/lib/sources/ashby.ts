import type { NewJob } from "../db";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { htmlToText } from "./html";
import { getJson, prettySlug } from "./http";

interface AshbyJob {
  title?: string;
  jobUrl?: string;
  location?: string;
  isRemote?: boolean;
  isListed?: boolean;
  employmentType?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  publishedAt?: string;
  compensation?: {
    scrapeableCompensationSalarySummary?: string | null;
    compensationTiers?: { components?: { compensationType?: string; interval?: string }[] }[];
  } | null;
}

/** "Salary: $211.4K - $290.6K per year" from Ashby's structured pay, so the salary reader sees it. */
export function ashbyPay(c: AshbyJob["compensation"]): string {
  const summary = c?.scrapeableCompensationSalarySummary?.trim();
  if (!summary) return "";
  const interval = c?.compensationTiers?.flatMap((t) => t.components ?? []).find((x) => x.compensationType === "Salary")?.interval ?? "";
  const per = /YEAR/i.test(interval) ? " per year" : /MONTH/i.test(interval) ? " per month" : /HOUR/i.test(interval) ? " per hour" : "";
  return `Salary: ${summary}${per}`;
}
export interface AshbyPayload {
  jobs?: AshbyJob[];
}

export function mapAshby(json: AshbyPayload, slug: string): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.jobs ?? []) {
    if (!j.title || !j.jobUrl || j.isListed === false) continue;
    const pay = ashbyPay(j.compensation);
    const body = j.descriptionPlain?.trim() || htmlToText(j.descriptionHtml ?? "");
    const description = pay ? `${body}\n\n${pay}` : body;
    const location = j.location ?? "";
    out.push({
      title: j.title.trim(),
      company: prettySlug(slug),
      location,
      remote: !!j.isRemote || guessRemote(`${location} ${j.title}`),
      url: j.jobUrl,
      source: "ashby",
      type: guessType(`${j.title} ${j.employmentType ?? ""}`, description),
      description,
      tags: extractTags(j.title, description),
      posted_at: normalizeDate(j.publishedAt),
      deadline: null,
    });
  }
  return out;
}

export async function scan(handle: string): Promise<{ jobs: NewJob[]; error?: string }> {
  const slug = handle.trim().toLowerCase();
  const { data, error } = await getJson<AshbyPayload>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
  );
  if (!data) return { jobs: [], error };
  return { jobs: mapAshby(data, slug) };
}
