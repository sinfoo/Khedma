import type { NewJob } from "../db";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { htmlToText, pickJsonLdJobPosting, pickMeta, pickTitle } from "./html";
import { getText, isPrivateHost } from "./http";

const MAX_DESC = 12_000;

// Apply-form pages of a posting (freehire's CanonicalPostingURL, MIT): "/apply" and "/application" are the same
// offer as the posting page, so one canonical URL keeps the dedupe from storing it twice.
const APPLY_SUFFIX: [RegExp, string][] = [
  [/^jobs\.ashbyhq\.com$/, "/application"],
  [/^jobs(\.eu)?\.lever\.co$/, "/apply"],
  [/^(apply|jobs)\.workable\.com$/, "/apply"],
];
export function canonicalPostingUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const suffix = APPLY_SUFFIX.find(([re]) => re.test(u.hostname.toLowerCase()))?.[1];
  const path = u.pathname.replace(/\/$/, "");
  if (!suffix || !path.toLowerCase().endsWith(suffix) || path.length === suffix.length) return raw;
  u.pathname = path.slice(0, -suffix.length);
  return u.toString();
}

/** Reject non-http(s) and private/loopback hosts so a pasted URL cannot probe the local network. */
export function validatePublicUrl(raw: string): { url?: URL; error?: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { error: "Invalid URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "Only http(s) URLs are allowed" };
  if (isPrivateHost(u.hostname)) return { error: "Private or local hosts are not allowed" };
  return { url: u };
}

type Json = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

export function fromJsonLd(ld: Json, url: string): NewJob {
  const title = str(ld.title) || str(ld.name);
  const company = str(obj(ld.hiringOrganization).name);
  const addr = obj(obj(first(ld.jobLocation)).address);
  const location = [str(addr.addressLocality), str(addr.addressRegion), str(addr.addressCountry)].filter(Boolean).join(", ");
  const description = htmlToText(str(ld.description)).slice(0, MAX_DESC);
  const remote = str(ld.jobLocationType).toUpperCase() === "TELECOMMUTE" || guessRemote(location);
  return {
    title,
    company,
    location,
    remote,
    url: str(ld.url) || url,
    source: "url",
    type: guessType(`${title} ${str(first(ld.employmentType))}`, description),
    description,
    tags: extractTags(title, description),
    posted_at: normalizeDate(str(ld.datePosted)),
    deadline: normalizeDate(str(ld.validThrough)),
  };
}

function fromHtml(html: string, u: URL): NewJob {
  const rawTitle = pickMeta(html, "og:title") || pickTitle(html) || u.hostname;
  // "Senior Dev | Acme" or "Senior Dev - Acme" -> keep the left side.
  const title = rawTitle.split(/\s+[|–—-]\s+/)[0].trim() || rawTitle;
  const company = pickMeta(html, "og:site_name") || u.hostname.replace(/^www\./, "");
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const description = htmlToText(body).slice(0, MAX_DESC);
  return {
    title,
    company,
    location: "",
    remote: guessRemote(title),
    url: pickMeta(html, "og:url") || u.toString(),
    source: "url",
    type: guessType(title, description),
    description,
    tags: extractTags(title, description),
    posted_at: null,
    deadline: null,
  };
}

/** Import one posting from a pasted URL. `text` is the page's plain text so the UI can let the user fix fields. */
export async function importFromUrl(raw: string): Promise<{ job?: NewJob; text: string; error?: string }> {
  const { url, error } = validatePublicUrl(raw);
  if (!url) return { text: "", error };
  const res = await getText(url.toString(), "text/html, application/xhtml+xml;q=0.9, */*;q=0.5");
  if (res.error) return { text: "", error: res.error };
  const html = res.text;
  const text = htmlToText(html).slice(0, MAX_DESC);
  try {
    const ld = pickJsonLdJobPosting(html);
    const parsed = ld ? fromJsonLd(ld, url.toString()) : fromHtml(html, url);
    const job = { ...parsed, url: canonicalPostingUrl(parsed.url) };
    if (!job.title) return { text, error: "Could not find a job title on that page" };
    // JS-rendered pages have almost no body text; the JSON-LD description is the better raw copy then.
    return { job, text: text.length >= job.description.length ? text : job.description };
  } catch (e) {
    return { text, error: `Could not parse page: ${(e as Error).message}` };
  }
}
