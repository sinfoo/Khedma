// Daijob (Japan, bilingual jobs): server-rendered English search results, robots.txt allows /en/jobs/.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType } from "./classify";
import { decodeEntities, htmlToText } from "./html";
import { getText, sleep } from "./http";

const BASE = "https://www.daijob.com";

export const daijobUrl = (keywords: string, page = 1) => `${BASE}/en/jobs/search_result?${new URLSearchParams({ keywords, page: String(page) })}`;

const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function parseDaijobList(html: string): NewJob[] {
  const out: NewJob[] = [];
  for (const c of html.split(/<div class="job-card-wrap">/).slice(1)) {
    const id = /href="\/en\/jobs\/detail\/(\d+)"/.exec(c)?.[1];
    const title = clean(/job-card__title[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/.exec(c)?.[1] ?? "");
    if (!id || !title) continue;
    const company = clean(/<img alt="([^"]*)"/.exec(c)?.[1] ?? "") || clean(/fw-bolder[^>]*>([\s\S]*?)<\/div>/.exec(c)?.[1] ?? "");
    const dl = (name: string) => clean(new RegExp(`<dt>\\s*<span>${name}</span>\\s*</dt>\\s*<dd>([\\s\\S]*?)</dd>`).exec(c)?.[1] ?? "");
    const locParts = dl("Location").split(/\s+/).filter((p) => p && p !== "Asia");
    const location = locParts.length ? [...new Set(locParts)].reverse().join(", ") : "Japan";
    const salary = dl("Salary");
    const jp = dl("Japanese Level");
    const body = htmlToText(/<dt><span>Job Description<\/span><\/dt>\s*<dd>([\s\S]*?)<\/dd>/.exec(c)?.[1] ?? "");
    const description = [salary && `Salary: ${salary}`, jp && `Japanese: ${jp}`, body].filter(Boolean).join("\n");
    out.push({
      title,
      company: company || "Daijob",
      location,
      remote: guessRemote(`${title} ${body.slice(0, 300)}`),
      url: `${BASE}/en/jobs/detail/${id}`,
      source: "daijob" as SourceKind,
      type: guessType(title, body),
      description,
      tags: extractTags(title, body),
      posted_at: null,
      deadline: null,
    });
  }
  return out;
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const terms = keywords.length ? keywords.slice(0, 3) : ["intern"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const { text, error: e } = await getText(daijobUrl(kw), "text/html", { timeoutMs: 15_000 });
    if (e) {
      error = e;
      continue;
    }
    jobs.push(...parseDaijobList(text));
    await sleep(800);
  }
  return { jobs, error: jobs.length ? undefined : error };
}
