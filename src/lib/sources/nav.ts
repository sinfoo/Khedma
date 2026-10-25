// Norway's public job board arbeidsplassen.nav.no (NAV). robots.txt allows everything (checked 2026-10-25).
// The search page streams its results in the Next.js flight data (self.__next_f.push chunks): searchResult.ads[].
// The format is internal, so it is pinned by a fixture test. The posting page renders the ad text server-side.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, matchesKeywords, normalizeDate } from "./classify";
import { htmlToText } from "./html";
import { getText } from "./http";

const BASE = "https://arbeidsplassen.nav.no";

interface NavAd {
  uuid?: string;
  title?: string;
  jobTitle?: string;
  published?: string;
  expires?: string;
  applicationDue?: string;
  employer?: { name?: string };
  locationList?: { city?: string; municipal?: string; county?: string; country?: string }[];
  generatedSearchMetadata?: { shortSummary?: string };
}

export const navSearchUrl = (q: string) => `${BASE}/stillinger?${new URLSearchParams({ q })}`;
export const navPostingUrl = (uuid: string) => `${BASE}/stillinger/stilling/${encodeURIComponent(uuid)}`;

/** The decoded flight text: every self.__next_f.push([1,"…"]) string, joined in order. */
export function flightText(html: string): string {
  let out = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      out += JSON.parse(m[1]) as string;
    } catch {
      // a broken chunk only loses its own text
    }
  }
  return out;
}

/** The JSON array that starts at `from` (an index on "["), or null; string-aware bracket matching. */
function arrayAt(s: string, from: number): unknown[] | null {
  let depth = 0;
  let inStr = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      if (--depth === 0) {
        try {
          return JSON.parse(s.slice(from, i + 1)) as unknown[];
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const titleCase = (s?: string) => (s ? s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) : "");

export function parseNavSearch(html: string): NewJob[] {
  const text = flightText(html);
  const key = '"searchResult":{"ads":';
  const at = text.indexOf(key);
  const ads = (at >= 0 ? arrayAt(text, at + key.length) : null) as NavAd[] | null;
  const out: NewJob[] = [];
  for (const a of ads ?? []) {
    if (!a.uuid || !a.title) continue;
    const title = a.title.trim();
    const l = a.locationList?.[0];
    const city = titleCase(l?.city || l?.municipal || l?.county);
    const description = [a.jobTitle && a.jobTitle !== title ? `Occupation: ${a.jobTitle}` : "", a.generatedSearchMetadata?.shortSummary ?? ""].filter(Boolean).join("\n\n");
    out.push({
      title,
      company: a.employer?.name?.trim() || "NAV",
      location: city ? `${city}, Norway` : "Norway",
      remote: guessRemote(title),
      url: navPostingUrl(a.uuid),
      source: "nav" as SourceKind,
      type: guessType(title, description),
      description,
      tags: extractTags(title, description),
      posted_at: normalizeDate(a.published),
      deadline: normalizeDate(a.applicationDue ?? a.expires),
    });
  }
  return out;
}

/** The ad text block of a posting page. */
export function parseNavDetail(html: string): string | null {
  const m = /class="arb-rich-text job-posting-text[^"]*">([\s\S]*?)<\/div>/.exec(html);
  const text = m ? htmlToText(m[1]) : "";
  return text.length >= 40 ? text : null;
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const terms = keywords.length ? keywords.slice(0, 3) : ["trainee"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const { text, error: e } = await getText(navSearchUrl(kw), "text/html", { timeoutMs: 20_000 });
    if (e) error = e;
    else jobs.push(...parseNavSearch(text));
  }
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  return { jobs: jobs.filter((j) => matchesKeywords(j.title, words)), error: jobs.length ? undefined : error };
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const { text, error } = await getText(job.url, "text/html", { timeoutMs: 20_000 });
  const body = error ? null : parseNavDetail(text);
  return body ? { description: [job.description, body].filter(Boolean).join("\n\n") } : null;
}
