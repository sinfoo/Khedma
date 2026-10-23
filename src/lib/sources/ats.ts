// Tracked companies: detect which ATS a careers URL runs on, and read plain careers pages.
import type { NewJob } from "../db";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { decodeEntities, htmlToText, pickMeta } from "./html";
import { getText, mapLimit, prettySlug } from "./http";
import { importFromUrl, validatePublicUrl } from "./url";
import { parseWorkdayBoard } from "./ats-more";

export type AtsKind = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters" | "recruitee" | "personio" | "pinpoint" | "workday" | "teamtailor" | "bamboohr" | "breezy" | "gem" | "rippling" | "flatchr" | "jobscore" | "join" | "softgarden" | "successfactors" | "icims" | "rss" | "careers";

export interface Detected {
  kind: AtsKind;
  handle: string;
  label: string;
  /** Name of the system recognised, for user feedback ("Workday" pages are read as plain careers pages). */
  ats?: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/;
/** Product subdomains that are never a company board (freehire rejects the same labels). */
const SUB_RESERVED = new Set(["app", "dashboard", "admin", "api", "support", "help", "blog", "docs", "www"]);
const HTML_ACCEPT = "text/html, application/xhtml+xml;q=0.9, */*;q=0.5";

/** Recognise an ATS from the URL alone (no network). */
export function detectAtsUrl(raw: string): Detected | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const seg = u.pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  const slug = seg[0] ?? "";
  const ok = SLUG_RE.test(slug);
  let m: RegExpExecArray | null;
  if (/^(boards|job-boards)(\.eu)?\.greenhouse\.io$/.test(host) && ok) {
    // boards.greenhouse.io/embed/job_board?for=slug
    const forSlug = slug === "embed" ? (u.searchParams.get("for") ?? "").toLowerCase() : slug;
    return SLUG_RE.test(forSlug) ? { kind: "greenhouse", handle: forSlug, label: prettySlug(forSlug), ats: "Greenhouse" } : null;
  }
  if (host === "boards-api.greenhouse.io" && seg[0] === "v1" && seg[1] === "boards" && seg[2] && SLUG_RE.test(seg[2])) return { kind: "greenhouse", handle: seg[2], label: prettySlug(seg[2]), ats: "Greenhouse" };
  if (/^jobs(\.eu)?\.lever\.co$/.test(host) && ok) return { kind: "lever", handle: slug, label: prettySlug(slug), ats: "Lever" };
  if (host === "api.lever.co" && seg[0] === "v0" && seg[1] === "postings" && seg[2] && SLUG_RE.test(seg[2])) return { kind: "lever", handle: seg[2], label: prettySlug(seg[2]), ats: "Lever" };
  if (host === "jobs.ashbyhq.com" && ok) return { kind: "ashby", handle: slug, label: prettySlug(slug), ats: "Ashby" };
  if ((m = /^([a-z0-9-]+)\.teamtailor\.com$/.exec(host)) && !SUB_RESERVED.has(m[1])) return { kind: "teamtailor", handle: m[1], label: prettySlug(m[1]), ats: "Teamtailor" };
  const wd = /myworkday(jobs|site)\.com$/.test(host) ? parseWorkdayBoard(`${host}${u.pathname}`) : null;
  if (wd) return { kind: "workday", handle: `${wd.host}/${wd.publicPath.replace(/^recruiting\//, "")}`, label: prettySlug(wd.tenant), ats: "Workday" };
  // Readers ported from freehire's board recogniser: board = first path segment or the subdomain.
  if (/^(careers|jobs)\.smartrecruiters\.com$/.test(host) && ok) return { kind: "smartrecruiters", handle: slug, label: prettySlug(slug), ats: "SmartRecruiters" };
  if (host === "api.smartrecruiters.com" && seg[0] === "v1" && seg[1] === "companies" && seg[2] && SLUG_RE.test(seg[2])) return { kind: "smartrecruiters", handle: seg[2], label: prettySlug(seg[2]), ats: "SmartRecruiters" };
  if (host === "apply.workable.com" && ok && slug !== "j" && slug !== "api") return { kind: "workable", handle: slug, label: prettySlug(slug), ats: "Workable" };
  if ((m = /^([a-z0-9-]+)\.recruitee\.com$/.exec(host)) && !SUB_RESERVED.has(m[1])) return { kind: "recruitee", handle: m[1], label: prettySlug(m[1]), ats: "Recruitee" };
  if ((m = /^([a-z0-9-]+)\.jobs\.personio\.(com|de)$/.exec(host))) return { kind: "personio", handle: m[1], label: prettySlug(m[1]), ats: "Personio" };
  if ((m = /^([a-z0-9-]+)\.pinpointhq\.com$/.exec(host)) && !SUB_RESERVED.has(m[1])) return { kind: "pinpoint", handle: m[1], label: prettySlug(m[1]), ats: "Pinpoint" };
  if ((m = /^([a-z0-9-]+)\.bamboohr\.com$/.exec(host)) && !SUB_RESERVED.has(m[1])) return { kind: "bamboohr", handle: m[1], label: prettySlug(m[1]), ats: "BambooHR" };
  if ((m = /^([a-z0-9-]+)\.breezy\.hr$/.exec(host)) && !SUB_RESERVED.has(m[1])) return { kind: "breezy", handle: m[1], label: prettySlug(m[1]), ats: "Breezy" };
  if (host === "jobs.gem.com" && ok) return { kind: "gem", handle: slug, label: prettySlug(slug), ats: "Gem" };
  if (host === "api.gem.com" && seg[0] === "job_board" && seg[2] && SLUG_RE.test(seg[2])) return { kind: "gem", handle: seg[2], label: prettySlug(seg[2]), ats: "Gem" };
  if (host === "ats.rippling.com" && ok && slug !== "api") return { kind: "rippling", handle: slug, label: prettySlug(slug), ats: "Rippling" };
  if (host === "careers.flatchr.io") {
    const fs = seg[0] === "company" ? seg[1] : seg[1] === "company" ? seg[2] : "";
    const f = (fs ?? "").replace(/\.json$/, "");
    if (f && SLUG_RE.test(f)) return { kind: "flatchr", handle: f, label: prettySlug(f), ats: "Flatchr" };
  }
  if (host === "careers.jobscore.com" && seg[0] === "careers" && seg[1] && SLUG_RE.test(seg[1])) return { kind: "jobscore", handle: seg[1], label: prettySlug(seg[1]), ats: "JobScore" };
  if (host === "join.com" && seg[0] === "companies" && seg[1] && SLUG_RE.test(seg[1])) return { kind: "join", handle: seg[1], label: prettySlug(seg[1]), ats: "JOIN" };
  if ((m = /^([a-z0-9-]+)\.softgarden\.io$/.exec(host)) && !SUB_RESERVED.has(m[1])) return { kind: "softgarden", handle: m[1], label: prettySlug(m[1]), ats: "softgarden" };
  if ((m = /^careers-([a-z0-9-]+)\.icims\.com$/.exec(host))) return { kind: "icims", handle: m[1], label: prettySlug(m[1]), ats: "iCIMS" };
  return null;
}

const EMBEDS: [RegExp, AtsKind, string][] = [
  [/boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9._-]+)/i, "greenhouse", "Greenhouse"],
  [/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9._-]+)/i, "greenhouse", "Greenhouse"],
  [/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/([a-z0-9._-]+)/i, "greenhouse", "Greenhouse"],
  [/api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9._-]+)/i, "ashby", "Ashby"],
  [/jobs\.ashbyhq\.com\/([a-z0-9._-]+)/i, "ashby", "Ashby"],
  [/api\.lever\.co\/v0\/postings\/([a-z0-9._-]+)/i, "lever", "Lever"],
  [/jobs(?:\.eu)?\.lever\.co\/([a-z0-9._-]+)/i, "lever", "Lever"],
  [/apply\.workable\.com\/(?!j\/|api\/)([a-z0-9._-]+)/i, "workable", "Workable"],
  [/(?:careers|jobs)\.smartrecruiters\.com\/([a-z0-9._-]+)/i, "smartrecruiters", "SmartRecruiters"],
  [/\/\/([a-z0-9-]+)\.recruitee\.com/i, "recruitee", "Recruitee"],
  [/\/\/([a-z0-9-]+)\.jobs\.personio\.(?:com|de)/i, "personio", "Personio"],
  [/\/\/([a-z0-9-]+)\.pinpointhq\.com/i, "pinpoint", "Pinpoint"],
  [/\/\/([a-z0-9-]+)\.teamtailor\.com/i, "teamtailor", "Teamtailor"],
  [/\/\/([a-z0-9-]+)\.bamboohr\.com\/careers/i, "bamboohr", "BambooHR"],
  [/\/\/([a-z0-9-]+)\.breezy\.hr/i, "breezy", "Breezy"],
  [/jobs\.gem\.com\/([a-z0-9._-]+)/i, "gem", "Gem"],
  [/ats\.rippling\.com\/(?!api\/)([a-z0-9._-]+)/i, "rippling", "Rippling"],
  [/careers\.flatchr\.io\/(?:[a-z]{2}\/)?company\/([a-z0-9._-]+)/i, "flatchr", "Flatchr"],
  [/careers\.jobscore\.com\/careers\/([a-z0-9._-]+)/i, "jobscore", "JobScore"],
  [/join\.com\/companies\/([a-z0-9._-]+)/i, "join", "JOIN"],
  [/\/\/([a-z0-9-]+)\.softgarden\.io/i, "softgarden", "softgarden"],
  [/\/\/careers-([a-z0-9-]+)\.icims\.com/i, "icims", "iCIMS"],
];
const NOT_SLUGS = new Set(["embed", "v0", "v1", "js", "api", "jobs", "boards"]);

/** Find an embedded ATS (links, iframes, board scripts) or a jobs RSS feed in a careers page. */
export function detectAtsInHtml(html: string): Detected | null {
  // Workday boards keep their case-sensitive site name, so they skip the lower-cased slug check below.
  const wd = /https?:\/\/([a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[^"'\s<>?#]+)/i.exec(html);
  const board = wd ? parseWorkdayBoard(wd[1]) : null;
  if (board) return { kind: "workday", handle: `${board.host}/${board.site}`, label: prettySlug(board.tenant), ats: "Workday" };
  for (const [re, kind, ats] of EMBEDS) {
    const m = re.exec(html);
    const slug = m?.[1]?.toLowerCase();
    if (slug && SLUG_RE.test(slug) && !NOT_SLUGS.has(slug)) return { kind, handle: slug, label: prettySlug(slug), ats };
  }
  const linkRe = /<link\b[^>]*>/gi;
  let l: RegExpExecArray | null;
  while ((l = linkRe.exec(html))) {
    const tag = l[0];
    if (!/type\s*=\s*["']application\/(rss|atom)\+xml["']/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (href && /job|career|carri|offre|emploi|vacanc/i.test(href) && /^https?:\/\//i.test(href)) return { kind: "rss", handle: decodeEntities(href), label: "", ats: "RSS" };
  }
  return null;
}

function labelFor(u: URL, html: string): string {
  const site = pickMeta(html, "og:site_name");
  if (site) return site.slice(0, 80);
  const parts = u.hostname.toLowerCase().replace(/^(www|careers|jobs|career|emploi|recrutement)\./, "").split(".");
  return prettySlug(parts.length > 1 ? parts[parts.length - 2] : parts[0]);
}

/** Careers URL -> the source to create: a known ATS board, an RSS feed, or the page itself. */
export async function detectAts(raw: string): Promise<Detected | { error: string }> {
  const { url, error } = validatePublicUrl(raw);
  if (!url) return { error: error ?? "Invalid URL" };
  const direct = detectAtsUrl(url.toString());
  if (direct) return direct;
  const res = await getText(url.toString(), HTML_ACCEPT, { timeoutMs: 12_000 });
  if (res.error) return { error: res.error };
  const label = labelFor(url, res.text);
  const embedded = detectAtsInHtml(res.text);
  if (embedded) return { ...embedded, label: embedded.label || label };
  // SuccessFactors career sites live on the employer's own host; their pages load SAP's rmk assets.
  if (/rmkcdn\.successfactors\.com|career\d*\.successfactors\.(com|eu)/i.test(res.text)) return { kind: "successfactors", handle: url.hostname, label, ats: "SAP SuccessFactors" };
  return { kind: "careers", handle: url.toString(), label };
}

// ---------- plain careers page ----------
type Json = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

/** Every JSON-LD JobPosting on a page (ItemList and @graph wrappers included). */
export function allJsonLdJobPostings(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack: unknown[] = [data];
    while (stack.length) {
      const cur = stack.pop();
      if (Array.isArray(cur)) stack.push(...cur);
      else if (cur && typeof cur === "object") {
        const o = cur as Json;
        const t = o["@type"];
        if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"))) out.push(o);
        for (const k of ["@graph", "itemListElement", "item"]) if (o[k]) stack.push(o[k]);
      }
    }
  }
  return out;
}

function fromJsonLd(ld: Json, company: string): NewJob | null {
  const title = str(ld.title) || str(ld.name);
  const url = str(ld.url);
  if (!title || !/^https?:\/\//i.test(url)) return null;
  const addr = obj(obj(first(ld.jobLocation)).address);
  const location = [str(addr.addressLocality), str(addr.addressRegion), str(addr.addressCountry)].filter(Boolean).join(", ");
  const description = htmlToText(str(ld.description)).slice(0, 12_000);
  return {
    title,
    company: str(obj(ld.hiringOrganization).name) || company,
    location,
    remote: str(ld.jobLocationType).toUpperCase() === "TELECOMMUTE" || guessRemote(location),
    url,
    source: "url",
    type: guessType(`${title} ${str(first(ld.employmentType))}`, description),
    description,
    tags: extractTags(title, description),
    posted_at: normalizeDate(str(ld.datePosted)),
    deadline: normalizeDate(str(ld.validThrough)),
  };
}

const JOB_PATH = /job|career|carri|offre|poste|emploi|stage|vacanc|position|opening|recrut/i;
const ATS_HOST = /(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|recruitee\.com|teamtailor\.com|bamboohr\.com|workable\.com)$/i;

/** Candidate posting links on a listing page: same site or an ATS host, deeper than the page itself, with their link text. */
export function collectJobLinks(html: string, page: URL): { href: string; text: string }[] {
  const out = new Map<string, string>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let u: URL;
    try {
      u = new URL(decodeEntities(m[1]), page);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    const sameSite = u.hostname.replace(/^www\./, "") === page.hostname.replace(/^www\./, "");
    if (!sameSite && !ATS_HOST.test(u.hostname)) continue;
    if (sameSite && !JOB_PATH.test(u.pathname + u.search)) continue;
    // The listing page itself, or a parent of it, is not a posting.
    if (sameSite && (u.pathname.replace(/\/$/, "") === page.pathname.replace(/\/$/, "") || u.pathname.length <= page.pathname.length)) continue;
    if (/\.(pdf|png|jpe?g|svg|css|js)$/i.test(u.pathname)) continue;
    u.hash = "";
    const href = u.toString();
    const text = htmlToText(m[2]).replace(/\s+/g, " ").trim();
    if (!out.has(href) || (text && !out.get(href))) out.set(href, text);
  }
  return [...out.entries()].map(([href, text]) => ({ href, text }));
}

const foldTxt = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Read a plain careers page: JSON-LD postings when present, else up to 20 linked posting pages. */
export async function scanCareersPage(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const { url, error } = validatePublicUrl(handle);
  if (!url) return { jobs: [], error };
  const res = await getText(url.toString(), HTML_ACCEPT, { timeoutMs: 12_000 });
  if (res.error) return { jobs: [], error: res.error };
  const company = labelFor(url, res.text);
  const ld = allJsonLdJobPostings(res.text).map((o) => fromJsonLd(o, company)).filter((j): j is NewJob => !!j);
  if (ld.length) return { jobs: ld };

  const links = collectJobLinks(res.text, url);
  if (!links.length) return { jobs: [], error: "No job links found on that page (it may need JavaScript)" };
  // Links whose text mentions a keyword first, then titles-looking texts; cap the detail fetches.
  const terms = keywords.flatMap((k) => foldTxt(k).split(/\s+/)).filter((w) => w.length >= 4);
  const pick = links
    .map((l) => ({ ...l, score: (terms.some((t) => foldTxt(l.text).includes(t)) ? 2 : 0) + (l.text.length >= 8 && l.text.length <= 120 ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  // ponytail: 20 pages, 3 at a time, 400 ms apart; a real crawler would read the site's own listing API.
  const pages = await mapLimit(pick, 3, async (l) => (await importFromUrl(l.href)).job ?? null, 400);
  const seen = new Set<string>();
  const jobs: NewJob[] = [];
  for (const j of pages) {
    if (!j || seen.has(j.url)) continue;
    seen.add(j.url);
    jobs.push({ ...j, company: j.company === url.hostname.replace(/^www\./, "") ? company : j.company });
  }
  return { jobs };
}
