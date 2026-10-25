// Job Bank (Government of Canada): robots.txt allows everything with Crawl-delay 5.
// Listing: the official Atom search feed (title, location, employer, salary; newest postings, a few days deep),
// with the server-rendered search (30 days) as fallback when the feed has nothing. The posting page carries the description (RDFa).
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { decodeEntities, htmlToText } from "./html";
import { getText, sleep } from "./http";

const BASE = "https://www.jobbank.gc.ca";

export function jobbankUrl(keywords: string, location = "", page = 1): string {
  const p = new URLSearchParams({ searchstring: keywords, sort: "M", fage: "30" });
  if (location) p.set("locationstring", location);
  if (page > 1) p.set("page", String(page));
  return `${BASE}/jobsearch/jobsearch?${p}`;
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "October 09, 2026" -> "2026-10-09" (kept as written; no timezone shift). */
export function parseLongDate(s: string): string | null {
  const m = /^([a-z]+)\s+(\d{1,2}),\s*(\d{4})$/i.exec(s.trim());
  const mo = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  return m && mo >= 0 ? `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}` : normalizeDate(s);
}

export function parseJobbankList(html: string): NewJob[] {
  const out: NewJob[] = [];
  for (const c of html.split(/<article id="article-\d+"/).slice(1)) {
    const id = /href="\/jobsearch\/jobposting\/(\d+)/.exec(c)?.[1];
    const title = clean(/class="noctitle"[^>]*>([\s\S]*?)<\/span>/.exec(c)?.[1] ?? "");
    if (!id || !title) continue;
    const li = (cls: string) => clean(new RegExp(`<li class="${cls}"[^>]*>([\\s\\S]*?)</li>`).exec(c)?.[1] ?? "");
    const company = li("business");
    const location = li("location").replace(/^Location\s*/, "").replace(/\s*\(([A-Z]{2})\)$/, ", $1") + ", Canada";
    const salary = li("salary").replace(/^Salary\s*/, "");
    const sourceName = clean(/job-source[^>]*><span class="wb-inv">([^<]*)</.exec(c)?.[1] ?? "");
    out.push({
      title,
      company: company || "Job Bank",
      location,
      remote: guessRemote(title),
      url: `${BASE}/jobsearch/jobposting/${id}`,
      source: "jobbank" as SourceKind,
      type: guessType(title),
      description: [salary && `Salary: ${salary}`, sourceName && `Posted via ${sourceName}`].filter(Boolean).join("\n"),
      tags: extractTags(title),
      posted_at: parseLongDate(li("date")),
      deadline: null,
    });
  }
  return out;
}

export function parseJobbankDetail(html: string): Partial<NewJob> | null {
  const raw = /property="description">([\s\S]*?)<\/span>/.exec(html)?.[1];
  if (!raw) return null;
  // The description is HTML escaped once inside the span.
  const description = htmlToText(decodeEntities(raw));
  if (description.length < 40) return null;
  const type = clean(/property="employmentType"[^>]*>([\s\S]*?)<\/span>\s*<\/span>/.exec(html)?.[1] ?? "");
  const mode = clean(/<span class="wb-inv">Work location<\/span>\s*<span>([^<]*)<\/span>/.exec(html)?.[1] ?? "");
  const head = [type && `Terms: ${type}`, mode && `Work location: ${mode}`].filter(Boolean).join(" · ");
  return { description: [head, description].filter(Boolean).join("\n\n"), remote: /remote|hybrid/i.test(mode) || undefined };
}

export const jobbankFeedUrl = (keywords: string, location = "") =>
  `${BASE}/jobsearch/feed/jobSearchRSSfeed?${new URLSearchParams({ searchstring: keywords, locationstring: location, sort: "D" })}`;

/** Atom entries: summary is "<strong>Location:</strong> Toronto (ON) <br /><strong>Employer:</strong> … <strong>Salary:</strong> …". */
export function parseJobbankFeed(xml: string): NewJob[] {
  const out: NewJob[] = [];
  for (const [, e] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = /href="https:\/\/www\.jobbank\.gc\.ca\/jobsearch\/jobposting\/(\d+)/.exec(e)?.[1];
    const title = clean(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(e)?.[1] ?? "");
    if (!id || !title) continue;
    const summary = /<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/.exec(e)?.[1] ?? "";
    const field = (k: string) => clean(new RegExp(`<strong>${k}:</strong>([\\s\\S]*?)(?:<br|$)`).exec(summary)?.[1] ?? "");
    const salary = field("Salary");
    out.push({
      title,
      company: field("Employer") || "Job Bank",
      location: `${field("Location").replace(/\s*\(([A-Z]{2})\)$/, ", $1")}, Canada`.replace(/^, /, ""),
      remote: guessRemote(title),
      url: `${BASE}/jobsearch/jobposting/${id}`,
      source: "jobbank" as SourceKind,
      type: guessType(title),
      description: salary ? `Salary: ${salary}` : "",
      tags: extractTags(title),
      posted_at: normalizeDate(/<updated>([^<]+)<\/updated>/.exec(e)?.[1]),
      deadline: null,
    });
  }
  return out;
}

const pause = () => sleep(5000); // robots.txt Crawl-delay: 5

export async function scan(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const terms = keywords.length ? keywords.slice(0, 2) : ["intern"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const feed = await getText(jobbankFeedUrl(kw, handle.trim()), "application/atom+xml, application/xml;q=0.9", { timeoutMs: 20_000 });
    await pause();
    const fresh = feed.error ? [] : parseJobbankFeed(feed.text);
    if (fresh.length) {
      jobs.push(...fresh);
      continue;
    }
    // The feed only holds the last few days; the HTML search reaches back 30.
    const { text, error: e } = await getText(jobbankUrl(kw, handle.trim()), "text/html", { timeoutMs: 20_000 });
    await pause();
    if (e) error = feed.error ?? e;
    else jobs.push(...parseJobbankList(text));
  }
  return { jobs, error: jobs.length ? undefined : error };
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const { text, error } = await getText(job.url, "text/html", { timeoutMs: 20_000 });
  if (error) return null;
  const d = parseJobbankDetail(text);
  return d ? { ...d, description: [job.description, d.description].filter(Boolean).join("\n\n") } : null;
}
