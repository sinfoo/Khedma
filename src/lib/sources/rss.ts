import type { NewJob } from "../db";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { decodeEntities, htmlToText } from "./html";
import { getText } from "./http";

// Regex RSS 2.0 / Atom reader. Enough for job feeds; not a general XML parser.

function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(xml);
  if (!m) return undefined;
  return decodeEntities(m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")).trim();
}

function link(xml: string): string | undefined {
  const plain = tag(xml, "link");
  if (plain && /^https?:\/\//i.test(plain)) return plain;
  // Atom: <link rel="alternate" href="..."/>. Prefer alternate, fall back to any href.
  const links = [...xml.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const pick = (attrs: string) => /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
  const alt = links.find((a) => /\brel\s*=\s*["']alternate["']/i.test(a) || !/\brel\s*=/i.test(a));
  return (alt && pick(alt)) || links.map(pick).find(Boolean);
}

/** Pull "Company" and "City" out of common job-feed title shapes. */
function splitTitle(raw: string, wantLocation: boolean): { title: string; company?: string; location?: string } {
  let title = raw.trim();
  let company: string | undefined;
  let location: string | undefined;
  // "Role // Company" (Berlin Startup Jobs): the suffix is the employer, never a place.
  const slashes = /^(.+?)\s+\/\/\s+([^/]{2,80})$/.exec(title);
  if (slashes) return { title: slashes[1].trim(), company: slashes[2].trim() };
  const colon = /^([^:]{2,60}):\s+(.+)$/.exec(title);
  if (colon) [company, title] = [colon[1].trim(), colon[2].trim()];
  // Only guess a location from the title when the feed gives none; suffixes are often team names.
  const sep = wantLocation ? /^(.+?)\s+(?:-|–|—|\|)\s+([^-–—|]{2,60})$/.exec(title) : null;
  if (sep) [title, location] = [sep[1].trim(), sep[2].trim()];
  return { title, company, location };
}

export function parseRss(xml: string, feedUrl: string): NewJob[] {
  const kind = /<feed\b/i.test(xml) && !/<rss\b/i.test(xml) ? "entry" : "item";
  const head = xml.split(new RegExp(`<${kind}\\b`, "i"))[0];
  const feedTitle = tag(head, "title") ?? "";
  const feedCompany = feedTitle.split(/[:|–—-]/)[0].trim() || new URL(feedUrl).hostname;
  const items = [...xml.matchAll(new RegExp(`<${kind}\\b[^>]*>([\\s\\S]*?)<\\/${kind}>`, "gi"))].map((m) => m[1]);

  const out: NewJob[] = [];
  for (const it of items) {
    const rawTitle = tag(it, "title");
    const url = link(it);
    if (!rawTitle || !url) continue;
    const region = tag(it, "region") ?? tag(it, "location");
    const { title, company, location } = splitTitle(rawTitle, !region);
    const body = tag(it, "content:encoded") ?? tag(it, "content") ?? tag(it, "description") ?? tag(it, "summary") ?? "";
    const description = htmlToText(body);
    const source = tag(it, "source") || tag(it, "dc:creator") || tag(it, "author")?.replace(/<[^>]+>/g, "").trim();
    const loc = region ?? location ?? "";
    out.push({
      title,
      company: company || source || feedCompany,
      location: loc,
      remote: guessRemote(`${loc} ${title}`) || guessRemote(description.slice(0, 400)),
      url,
      source: "rss",
      type: guessType(title, description),
      description,
      tags: extractTags(title, description),
      posted_at: normalizeDate(tag(it, "pubDate") ?? tag(it, "published") ?? tag(it, "updated") ?? tag(it, "dc:date")),
      deadline: null,
    });
  }
  return out;
}

export async function scan(handle: string): Promise<{ jobs: NewJob[]; error?: string }> {
  const url = handle.trim();
  if (!/^https?:\/\//i.test(url)) return { jobs: [], error: `Not a feed URL: ${handle}` };
  const { text, error } = await getText(url, "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5");
  if (error) return { jobs: [], error };
  if (!/<(rss|feed|rdf:RDF)\b/i.test(text)) return { jobs: [], error: `Not an RSS/Atom feed: ${url}` };
  try {
    return { jobs: parseRss(text, url) };
  } catch (e) {
    return { jobs: [], error: `Feed parse failed: ${(e as Error).message}` };
  }
}
