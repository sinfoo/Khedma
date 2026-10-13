// EnglishJobs.de / EnglishJobs.fr / EnglishJobSearch.ch: one engine, English-speaking offers per country.
// Server-rendered listing at /jobs/<words_joined_by_underscores>?page=N; robots.txt allows it
// (only the /clickout/ redirects are disallowed for crawlers — we store them as the offer link, never fetch them).
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType } from "./classify";
import { decodeEntities, htmlToText } from "./html";
import { getText } from "./http";

const SITES = {
  englishjobs_de: { base: "https://www.englishjobs.de", country: "Germany" },
  englishjobs_fr: { base: "https://www.englishjobs.fr", country: "France" },
  englishjobs_ch: { base: "https://www.englishjobsearch.ch", country: "Switzerland" },
} as const;
export type EnglishJobsSite = keyof typeof SITES;

export function englishjobsUrl(site: EnglishJobsSite, keywords: string, page = 1): string {
  const slug = keywords.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  return `${SITES[site].base}/jobs/${encodeURIComponent(slug)}${page > 1 ? `?page=${page}` : ""}`;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "August 4" -> ISO date in the most recent past year. */
export function parseMonthDay(s: string, now = new Date()): string | null {
  const m = /^([a-z]+)\s+(\d{1,2})$/i.exec(s.trim());
  if (!m) return null;
  const mo = MONTHS.indexOf(m[1].toLowerCase());
  if (mo < 0) return null;
  let y = now.getUTCFullYear();
  if (new Date(Date.UTC(y, mo, +m[2])).getTime() > now.getTime() + 86_400_000) y--;
  return `${y}-${String(mo + 1).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

const clean = (s: string) => decodeEntities(s.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<\/?em>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function parseEnglishjobsList(html: string, site: EnglishJobsSite, now = new Date()): NewJob[] {
  const out: NewJob[] = [];
  const cards = html.split(/<div id="([0-9a-f]{12,})" class="job js-job/).slice(1);
  for (let i = 0; i + 1 < cards.length; i += 2) {
    const id = cards[i];
    const c = cards[i + 1];
    const title = clean(/itemprop="title"[^>]*>([\s\S]*?)<\/h3>/.exec(c)?.[1] ?? "");
    if (!title) continue;
    const ulEnd = c.indexOf("</ul>");
    const lis = [...c.slice(0, ulEnd).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => clean(m[1]));
    // Shape: company, city, "Month D", then tag pills (student, no experience…).
    const [company = "", city = "", date = ""] = lis;
    const tags = lis.slice(3).filter(Boolean);
    const snippet = clean(/<\/ul><\/div><div[^>]*>([\s\S]*?)<\/div><\/div>/.exec(c.slice(ulEnd))?.[1] ?? "").replace(/^Logo\s*/, "");
    const location = city && city !== SITES[site].country ? `${city}, ${SITES[site].country}` : SITES[site].country;
    const description = [tags.length && `Tags: ${tags.join(", ")}`, snippet].filter(Boolean).join("\n\n");
    out.push({
      title,
      company: company || "EnglishJobs",
      location,
      remote: guessRemote(`${title} ${city}`),
      url: `${SITES[site].base}/clickout/${id}`,
      source: site as SourceKind,
      type: guessType(`${title} ${tags.includes("student") ? "intern" : ""}`, htmlToText(snippet)),
      description,
      tags: extractTags(title, snippet),
      posted_at: parseMonthDay(date, now),
      deadline: null,
    });
  }
  return out;
}

export function make(site: EnglishJobsSite) {
  return async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
    const terms = keywords.length ? keywords.slice(0, 3) : ["intern"];
    const jobs: NewJob[] = [];
    let error: string | undefined;
    for (const kw of terms) {
      const { text, error: e } = await getText(englishjobsUrl(site, kw), "text/html", { timeoutMs: 15_000 });
      if (e) {
        error = e;
        continue;
      }
      jobs.push(...parseEnglishjobsList(text, site));
      await new Promise((r) => setTimeout(r, 800));
    }
    return { jobs, error: jobs.length ? undefined : error };
  };
}
