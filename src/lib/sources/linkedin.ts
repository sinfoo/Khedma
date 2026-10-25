// LinkedIn "guest" job search: the public, logged-out search page LinkedIn serves to visitors.
// Unofficial and rate-limited; kept to one small request per keyword and a few detail pages.
import type { NewJob } from "../db";
import { decodeEntities, htmlToText } from "./html";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { getText, sleep } from "./http";

const SEARCH = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
// A browser-like UA: the guest endpoint answers 4xx to unknown clients.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export function linkedinSearchUrl(keywords: string, location: string, start = 0): string {
  const p = new URLSearchParams({ keywords, location, start: String(start), f_TPR: "r2592000" }); // last 30 days
  return `${SEARCH}?${p}`;
}

const pick = (block: string, re: RegExp) => decodeEntities((block.match(re)?.[1] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Parse the guest search HTML into offers (title, company, location, url, date). */
export function parseLinkedinSearch(html: string): NewJob[] {
  const out: NewJob[] = [];
  const cards = html.split(/<li>/).slice(1);
  for (const c of cards) {
    const href = c.match(/class="base-card__full-link[^"]*"\s+href="([^"]+)"/)?.[1];
    const title = pick(c, /base-search-card__title[^>]*>([\s\S]*?)<\/h3>/);
    if (!href || !title) continue;
    const url = decodeEntities(href).split("?")[0];
    const company = pick(c, /base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/) || "LinkedIn";
    const location = pick(c, /job-search-card__location[^>]*>([\s\S]*?)<\/span>/);
    const posted = c.match(/<time[^>]*datetime="([^"]+)"/)?.[1] ?? null;
    out.push({
      title,
      company,
      location,
      remote: guessRemote(`${title} ${location}`),
      url,
      source: "linkedin",
      type: guessType(title, ""),
      description: "",
      tags: extractTags(title, ""),
      posted_at: normalizeDate(posted),
      deadline: null,
    });
  }
  return out;
}

/** Description from the public job view page (works logged out for most postings). */
export function parseLinkedinView(html: string): Partial<NewJob> | null {
  const m = html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>\s*<\/div>/) ?? html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/);
  if (!m) return null;
  const description = htmlToText(m[1]).trim();
  if (description.length < 80) return null;
  const criteria = [...html.matchAll(/description__job-criteria-text[^>]*>([^<]*)</g)].map((x) => decodeEntities(x[1]).trim());
  const extra = criteria.length ? `\n\n${criteria.join(" · ")}` : "";
  return { description: description + extra };
}

export async function scan(_handle: string, keywords: string[]): Promise<{ jobs: NewJob[]; error?: string }> {
  const location = _handle.trim() || "Tunisia";
  const terms = keywords.length ? keywords.slice(0, 3) : ["stage"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const { text, error: e } = await getText(linkedinSearchUrl(kw, location), "text/html", { ua: UA, timeoutMs: 15_000 });
    if (e) {
      error = e;
      continue;
    }
    jobs.push(...parseLinkedinSearch(text));
    await sleep(1200); // be gentle
  }
  // A failed keyword is reported even when others worked, so the scan shows the source as partly read.
  return { jobs, error };
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const { text, error } = await getText(job.url, "text/html", { ua: UA, timeoutMs: 15_000 });
  if (error) return null;
  return parseLinkedinView(text);
}
