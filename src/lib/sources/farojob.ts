import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, matchesKeywords, normalizeDate } from "./classify";
import { decodeEntities, htmlToText } from "./html";
import { getText, sleep } from "./http";

// Farojob (WordPress). Its keyword search ranks years-old posts first, so we read the
// newest listing pages (all offers or one /job-category/<slug>/), drop anything older
// than MAX_AGE_DAYS and filter by keyword locally.

const ORIGIN = "https://www.farojob.net";
const SOURCE = "farojob" as SourceKind;
const PAGES = 2;
const MAX_AGE_DAYS = 120;

export function farojobListUrl(handle: string, page = 1): string {
  const slug = handle.trim().toLowerCase().replace(/^https?:\/\/www\.farojob\.net/i, "").replace(/^\/+|\/+$/g, "").replace(/^job-category\//, "");
  const base = /^[a-z0-9-]+$/.test(slug) ? `${ORIGIN}/job-category/${slug}/` : `${ORIGIN}/jobs/`;
  return page > 1 ? `${base}page/${page}/` : base;
}

const text = (html: string | undefined) => (html ? htmlToText(html).replace(/\s+/g, " ").trim() : "");

/** "Eminence recrute un(e) Account Manager" -> "Account Manager". */
export function stripRecruitPrefix(title: string, company: string): string {
  const t = title.replace(/^.{1,80}?\s+(?:recrute(?:nt)?|offre|propose|lance)\s+(?:(?:un|une|des|un\(e\)|plusieurs|\d+)\s+)?/i, "");
  return t && t !== title && company ? t.charAt(0).toUpperCase() + t.slice(1) : title;
}

export function parseFarojobList(html: string, now = new Date()): NewJob[] {
  const out: NewJob[] = [];
  const cutoff = new Date(now.getTime() - MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const art of html.split(/<article class="loadmore-item noo_job/).slice(1)) {
    const url = /data-url="([^"]+)"/.exec(art)?.[1];
    const rawTitle = text(/class="loop-item-title"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/.exec(art)?.[1]);
    if (!url || !rawTitle) continue;
    const company = text(/class="job-company"[^>]*>([\s\S]*?)<\/span>\s*<\/a>/.exec(art)?.[1]) || text(/class="job-company"[^>]*>([\s\S]*?)<\/span>/.exec(art)?.[1]);
    const location = [...art.matchAll(/class="job-location"[\s\S]*?<em>([\s\S]*?)<\/em>/g)].map((m) => text(m[1])).join(", ");
    const posted = normalizeDate(/<time[^>]*datetime="([^"]+)"/.exec(art)?.[1]);
    if (posted && posted < cutoff) continue;
    const categories = [...art.slice(0, 600).matchAll(/job_category-([a-z0-9-]+)/g)].map((m) => m[1].replace(/-/g, " "));
    const title = stripRecruitPrefix(decodeEntities(rawTitle), company);
    out.push({
      title,
      company: company || "Farojob",
      location,
      remote: guessRemote(title),
      url: decodeEntities(url),
      source: SOURCE,
      type: guessType(title),
      description: categories.length ? `Catégories : ${categories.join(", ")}` : "",
      tags: extractTags(title),
      posted_at: posted,
      deadline: null,
    });
  }
  return out;
}

export function parseFarojobDetail(html: string): Partial<NewJob> | null {
  const start = html.search(/<div class="job-desc"/);
  if (start < 0) return null;
  const end = html.indexOf('class="job-action', start);
  const description = htmlToText(html.slice(start, end > start ? end : start + 20_000))
    .replace(/^Description de l.emploi\s*/i, "")
    .slice(0, 12_000)
    .trim();
  return description ? { description } : null;
}

export async function scan(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const byUrl = new Map<string, NewJob>();
  let error: string | undefined;
  for (let page = 1; page <= PAGES; page++) {
    if (page > 1) await sleep(800);
    const res = await getText(farojobListUrl(handle, page), "text/html");
    if (res.error) {
      if (page === 1) error = res.error;
      break;
    }
    const jobs = parseFarojobList(res.text);
    for (const j of jobs) byUrl.set(j.url, j);
    if (!res.text.includes("noo_job")) {
      if (page === 1) error = "Farojob page format changed: no offers found";
      break;
    }
  }
  const jobs = [...byUrl.values()].filter((j) => matchesKeywords(`${j.title} ${j.description}`, keywords));
  return { jobs, error: byUrl.size ? undefined : error };
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const { text: html, error } = await getText(job.url, "text/html");
  if (error) return null;
  const d = parseFarojobDetail(html);
  if (!d?.description) return null;
  return { description: [job.description, d.description].filter(Boolean).join("\n\n") };
}
