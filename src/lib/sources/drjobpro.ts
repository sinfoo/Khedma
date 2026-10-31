// Dr.Job (drjobpro.com): a Gulf and Middle East board with one listing page per country and keyword
// (/egypt/software-engineer-jobs). robots.txt (checked 2026-10-31) allows every agent, AI crawlers named, except
// tracking and refine URLs, which Khedma never builds. Cards give title, employer and place; the posting page's
// JobPosting JSON-LD gives the full text. The handle is a comma list of ISO codes ("eg,sa").
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, matchesKeywords } from "./classify";
import { htmlToText } from "./html";
import { getText, sleep } from "./http";

const BASE = "https://www.drjobpro.com";
const HTML = "text/html, application/xhtml+xml;q=0.9, */*;q=0.5";
/** Country path of each covered ISO code. The UAE has no listing path (0 offers on 2026-10-31). */
export const DRJOB_COUNTRIES: Record<string, string> = {
  MA: "morocco", DZ: "algeria", LY: "libya", EG: "egypt", SA: "saudi-arabia", QA: "qatar", KW: "kuwait", OM: "oman", BH: "bahrain",
};

const slug = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const drjobUrl = (country: string, keyword: string) => `${BASE}/${country}/${slug(keyword) ? `${slug(keyword)}-` : ""}jobs`;
const text = (s?: string) => htmlToText(s ?? "").replace(/\s+/g, " ").trim();

const DAYS: Record<string, number> = { minute: 0, hour: 1 / 24, day: 1, week: 7, month: 30 };
/** "23 hours ago", "3 days ago", "2 weeks ago" -> the day it was posted. */
export function agoDate(s: string, now = new Date()): string | null {
  const m = /(\d+)\s*(minute|hour|day|week|month)s?\s+ago/i.exec(s);
  if (!m) return null;
  const days = Number(m[1]) * DAYS[m[2].toLowerCase()];
  return new Date(now.getTime() - Math.floor(days) * 86_400_000).toISOString().slice(0, 10);
}

export function parseDrjobList(html: string, now = new Date()): NewJob[] {
  const out: NewJob[] = [];
  for (const card of html.split(/class="card-item job-card/).slice(1)) {
    const url = /<a href="(https:\/\/www\.drjobpro\.com\/[a-z-]+\/jobs\/[^"]+)" class="job-card-stretched-link"/.exec(card)?.[1];
    const title = text(/<h2 class="job-name">([\s\S]*?)<\/h2>/.exec(card)?.[1]);
    if (!url || !title) continue;
    const company = text(/<p class="company-name">([\s\S]*?)<\/p>/.exec(card)?.[1]);
    const place = text(/<div class="location">[\s\S]*?<span>([\s\S]*?)<\/span>/.exec(card)?.[1]).replace(/\s+-\s+/g, ", ");
    const summary = text(/job-desc-attr">([\s\S]*?)<\/p>/.exec(card)?.[1]);
    const kind = text(/<span class="job-type[^"]*">([\s\S]*?)<\/span>/.exec(card)?.[1]);
    out.push({
      title, company: company || "Dr.Job", location: place, remote: guessRemote(`${title} ${place}`),
      url, source: "drjobpro" as SourceKind, type: guessType(`${title} ${kind}`, summary), description: summary,
      tags: extractTags(title, summary), posted_at: agoDate(/<div class="posted-date">\s*<span>([^<]*)<\/span>/.exec(card)?.[1] ?? "", now), deadline: null,
    });
  }
  return out;
}

// ponytail: first listing page (20 offers) per country and keyword, 6 countries x 2 keywords at most, 1 s apart.
export async function scan(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const countries = handle.split(",").map((c) => DRJOB_COUNTRIES[c.trim().toUpperCase()]).filter(Boolean).slice(0, 6);
  if (!countries.length) return { jobs: [], error: "Dr.Job: choose at least one country code (e.g. eg,sa)" };
  const terms = keywords.length ? keywords.slice(0, 2) : ["internship"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  let first = true;
  for (const country of countries) {
    for (const kw of terms) {
      if (!first) await sleep(1000);
      first = false;
      const { text: html, error: e } = await getText(drjobUrl(country, kw), HTML);
      if (html) jobs.push(...parseDrjobList(html));
      else error = e;
    }
  }
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  return { jobs: jobs.filter((j) => matchesKeywords(j.title, words)), error: jobs.length ? undefined : error };
}
