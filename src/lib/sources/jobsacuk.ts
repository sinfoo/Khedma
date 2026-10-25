// jobs.ac.uk: UK academic, research and PhD posts. Server-rendered keyword search (robots.txt only blocks
// /job/feedback/ and /enhanced/fp/); posting pages carry schema.org JobPosting JSON-LD.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { ldDetail } from "./ats-more";
import { extractTags, guessRemote, guessType } from "./classify";
import { decodeEntities } from "./html";
import { getText } from "./http";

const BASE = "https://www.jobs.ac.uk";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const jobsacukUrl = (keywords: string) => `${BASE}/search/?${new URLSearchParams({ keywords, sortOrder: "0", pageSize: "25", startIndex: "1" })}`;

/** "22 Oct" -> ISO date in the most recent past year, or (closing dates) the next one. */
export function parseDayMonth(s: string, future: boolean, now = new Date()): string | null {
  const m = /^(\d{1,2})\s+([a-z]{3})/i.exec(s.trim());
  const mo = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || mo < 0) return null;
  let y = now.getUTCFullYear();
  const t = Date.UTC(y, mo, +m[1]);
  const day = 86_400_000;
  if (future && t < now.getTime() - 60 * day) y++;
  if (!future && t > now.getTime() + day) y--;
  return `${y}-${String(mo + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// No visa sponsorship / must already hold the right to work: a dead end for most international students.
const RTW = /right to (live and )?work in the (uk|united kingdom)|eligib\w* to work in the (uk|united kingdom)|(unable|not able|cannot|can ?not|do not|does not|will not|won't) (to )?(offer|provide|support)\b[^.\n]{0,30}\b(visa|sponsor)|(unable|not able|cannot|can ?not) (to )?sponsor|sponsorship (is )?(not |un)available|\bno (visa )?sponsorship|not eligible for (visa )?sponsorship|without (the need for )?(visa )?sponsorship/i;

/** Puts "UK right to work required" on top when the text says sponsorship is not offered. */
export function flagUkRightToWork(description: string): string {
  return RTW.test(description) && !description.startsWith("UK right to work required") ? `UK right to work required\n\n${description}` : description;
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function parseJobsacukList(html: string, now = new Date()): NewJob[] {
  const out: NewJob[] = [];
  for (const c of html.split(/<div class="j-search-result__result\b/).slice(1)) {
    const a = /<a href="(\/job\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(c);
    const title = clean(a?.[2] ?? "");
    if (!a || !title) continue;
    const div = (cls: string) => clean(new RegExp(`class="j-search-result__${cls}"[^>]*>([\\s\\S]*?)</div>`).exec(c)?.[1] ?? "");
    const place = clean(/<div>Location:([\s\S]*?)<\/div>/.exec(c)?.[1] ?? "");
    const salary = div("info").replace(/^Salary:\s*/, "");
    const department = div("department");
    const placed = clean(/Date Placed:\s*<\/strong>([^<]*)/.exec(c)?.[1] ?? "");
    const closes = clean(/j-search-result__date--blue[^>]*>([^<]*)</.exec(c)?.[1] ?? "");
    const description = [department, salary && `Salary: ${salary}`].filter(Boolean).join("\n");
    out.push({
      title,
      company: clean(/j-search-result__employer"[^>]*>([\s\S]*?)<\/div>/.exec(c)?.[1] ?? "") || "jobs.ac.uk",
      location: place ? `${place}, United Kingdom` : "United Kingdom",
      remote: guessRemote(place),
      url: `${BASE}${a[1]}`,
      source: "jobsacuk" as SourceKind,
      type: guessType(title, description),
      description,
      tags: extractTags(title, department),
      posted_at: parseDayMonth(placed, false, now),
      deadline: parseDayMonth(closes, true, now),
    });
  }
  return out;
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of (keywords.length ? keywords : ["software engineer"]).slice(0, 3)) {
    const { text, error: e } = await getText(jobsacukUrl(kw), "text/html", { timeoutMs: 20_000 });
    if (e) error = e;
    else jobs.push(...parseJobsacukList(text));
  }
  return { jobs, error: jobs.length ? undefined : error };
}

/** JSON-LD body, closing date kept from the listing when the page has none; right-to-work flag on top. */
export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const d = await ldDetail(job);
  if (!d?.description) return null;
  // JSON-LD names the country, so overseas posts (Suzhou, Dubai…) lose the listing's assumed "United Kingdom".
  // Its TELECOMMUTE flag is also set on hybrid posts, so the listing's remote guess is kept.
  return {
    description: flagUkRightToWork([job.description, d.description].filter(Boolean).join("\n\n")),
    location: d.location || job.location,
    deadline: d.deadline || job.deadline,
    posted_at: d.posted_at || job.posted_at,
  };
}
