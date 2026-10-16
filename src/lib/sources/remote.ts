// Remote-first boards with free, keyless JSON APIs (verified live 2026-10-13, robots.txt checked).
// Each API asks for a link back to its own posting URL and a source mention: `url` keeps their page, `source` names them.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, matchesKeywords, normalizeDate } from "./classify";
import { decodeEntities, htmlToText } from "./html";
import { getJson, getText } from "./http";
import { parseRss } from "./rss";

type Listed = { jobs: NewJob[]; error?: string };
const text = (html?: string) => htmlToText(decodeEntities(html ?? ""));
/** Keyword words long enough to be meaningful in a title ("software intern" -> software, intern). */
const words = (keywords: string[]) => keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
const byTitle = (jobs: NewJob[], keywords: string[]) => jobs.filter((j) => matchesKeywords(j.title, words(keywords)));

// ---------- Remote OK — https://remoteok.com/api (robots: Crawl-delay 1, /api allowed) ----------
interface RemoteOkJob { id?: string; position?: string; company?: string; location?: string; url?: string; description?: string; tags?: string[]; date?: string }
export type RemoteOkPayload = (RemoteOkJob | { legal?: string })[];
export const remoteokUrl = (tag: string) => `https://remoteok.com/api?${new URLSearchParams({ tag })}`;

export function mapRemoteOk(json: RemoteOkPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json as RemoteOkJob[]) {
    if (!j.position || !j.url) continue;
    const title = j.position.trim();
    const description = text(j.description);
    out.push({
      title, company: j.company?.trim() || "Remote OK", location: j.location?.trim() || "Remote", remote: true,
      url: j.url, source: "remoteok" as SourceKind,
      type: guessType(`${title} ${(j.tags ?? []).join(" ")}`, description), description, tags: extractTags(title, description),
      posted_at: normalizeDate(j.date), deadline: null,
    });
  }
  return out;
}

async function scanRemoteOk(_handle: string, keywords: string[] = []): Promise<Listed> {
  // The API filters by one site tag; "dev" is the engineering feed. Keywords then filter titles locally.
  const { data, error } = await getJson<RemoteOkPayload>(remoteokUrl("dev"));
  return data ? { jobs: byTitle(mapRemoteOk(data), keywords) } : { jobs: [], error };
}

// ---------- Jobicy — https://jobicy.com/api/v2/remote-jobs (docs: jobi.cy/apidocs) ----------
interface JobicyJob { url?: string; jobTitle?: string; companyName?: string; jobGeo?: string; jobType?: string[]; jobLevel?: string; jobDescription?: string; pubDate?: string }
export interface JobicyPayload { jobs?: JobicyJob[] }
export const jobicyUrl = (tag: string, geo = "") => `https://jobicy.com/api/v2/remote-jobs?${new URLSearchParams({ count: "50", ...(tag && { tag }), ...(geo && { geo }) })}`;

export function mapJobicy(json: JobicyPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.jobs ?? []) {
    if (!j.jobTitle || !j.url) continue;
    const title = j.jobTitle.trim();
    const description = text(j.jobDescription);
    out.push({
      title, company: j.companyName?.trim() || "Jobicy", location: j.jobGeo?.trim() || "Anywhere", remote: true,
      url: j.url, source: "jobicy" as SourceKind,
      type: guessType(`${title} ${j.jobLevel ?? ""} ${(j.jobType ?? []).join(" ")}`, description), description, tags: extractTags(title, description),
      posted_at: normalizeDate(j.pubDate), deadline: null,
    });
  }
  return out;
}

async function scanJobicy(handle: string, keywords: string[] = []): Promise<Listed> {
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of keywords.length ? keywords.slice(0, 2) : ["intern"]) {
    const { data, error: e } = await getJson<JobicyPayload>(jobicyUrl(kw, handle));
    if (data) jobs.push(...mapJobicy(data));
    else error = e;
  }
  return { jobs: byTitle(jobs, keywords), error: jobs.length ? undefined : error };
}

// ---------- Himalayas — https://himalayas.app/jobs/api ----------
interface HimalayasJob { title?: string; companyName?: string; applicationLink?: string; guid?: string; description?: string; employmentType?: string; seniority?: string[]; locationRestrictions?: string[]; pubDate?: number; expiryDate?: number }
export interface HimalayasPayload { jobs?: HimalayasJob[] }
export const himalayasUrl = (search: string) => `https://himalayas.app/jobs/api?${new URLSearchParams({ limit: "50", search })}`;

export function mapHimalayas(json: HimalayasPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.jobs ?? []) {
    const url = j.applicationLink || j.guid;
    if (!j.title || !url) continue;
    const title = j.title.trim();
    const description = text(j.description);
    out.push({
      title, company: j.companyName?.trim() || "Himalayas", location: j.locationRestrictions?.length ? j.locationRestrictions.join(", ") : "Worldwide", remote: true,
      url, source: "himalayas" as SourceKind,
      type: guessType(`${title} ${j.employmentType ?? ""} ${(j.seniority ?? []).join(" ")}`, description), description, tags: extractTags(title, description),
      posted_at: j.pubDate ? normalizeDate(j.pubDate * 1000) : null, deadline: j.expiryDate ? normalizeDate(j.expiryDate * 1000) : null,
    });
  }
  return out;
}

async function scanHimalayas(_handle: string, keywords: string[] = []): Promise<Listed> {
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of keywords.length ? keywords.slice(0, 2) : ["software intern"]) {
    const { data, error: e } = await getJson<HimalayasPayload>(himalayasUrl(kw));
    if (data) jobs.push(...mapHimalayas(data));
    else error = e;
  }
  return { jobs: byTitle(jobs, keywords), error: jobs.length ? undefined : error };
}

// ---------- Remotive — https://remotive.com/api/remote-jobs ----------
// robots.txt disallows "*search=", so we read the software-dev category and filter locally. Their notice asks
// for at most ~4 calls a day and a link back to the Remotive posting (kept as `url`).
interface RemotiveJob { url?: string; title?: string; company_name?: string; candidate_required_location?: string; job_type?: string; publication_date?: string; description?: string; tags?: string[] }
export interface RemotivePayload { jobs?: RemotiveJob[] }
export const remotiveUrl = (category = "software-dev") => `https://remotive.com/api/remote-jobs?${new URLSearchParams({ category, limit: "100" })}`;

export function mapRemotive(json: RemotivePayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.jobs ?? []) {
    if (!j.title || !j.url) continue;
    const title = j.title.trim();
    const description = text(j.description);
    out.push({
      title, company: j.company_name?.trim() || "Remotive", location: j.candidate_required_location?.trim() || "Worldwide", remote: true,
      url: j.url, source: "remotive" as SourceKind,
      type: guessType(`${title} ${j.job_type ?? ""}`, description), description, tags: extractTags(title, description),
      posted_at: normalizeDate(j.publication_date), deadline: null,
    });
  }
  return out;
}

async function scanRemotive(_handle: string, keywords: string[] = []): Promise<Listed> {
  const { data, error } = await getJson<RemotivePayload>(remotiveUrl());
  return data ? { jobs: byTitle(mapRemotive(data), keywords) } : { jobs: [], error };
}

// ---------- Artificial Intelligence Jobs — https://artificialintelligencejobs.co/api/jobs (no key, robots allow all) ----------
interface AiJob { title?: string; company?: string; location?: string; remote?: boolean; level?: string; url?: string; apply_url?: string; posted?: string }
export interface AiJobsPayload { jobs?: AiJob[] }
export const aijobsUrl = (q: string) => `https://artificialintelligencejobs.co/api/jobs?${new URLSearchParams({ q, limit: "100" })}`;

export function mapAiJobs(json: AiJobsPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.jobs ?? []) {
    if (!j.title || !j.url) continue;
    const title = j.title.trim();
    const location = j.location?.trim() || (j.remote ? "Remote" : "");
    out.push({
      title, company: j.company?.trim() || "AI Jobs", location, remote: !!j.remote || guessRemote(`${title} ${location}`),
      url: j.url, source: "aijobs" as SourceKind,
      // The feed has no body: the level ("Intern", "Senior") stands in for it.
      type: guessType(`${title} ${j.level ?? ""}`), description: "", tags: extractTags(title),
      posted_at: normalizeDate(j.posted), deadline: null,
    });
  }
  return out;
}

async function scanAiJobs(_handle: string, keywords: string[] = []): Promise<Listed> {
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of keywords.length ? keywords.slice(0, 2) : ["intern"]) {
    const { data, error: e } = await getJson<AiJobsPayload>(aijobsUrl(kw));
    if (data) jobs.push(...mapAiJobs(data));
    else error = e;
  }
  return { jobs: byTitle(jobs, keywords), error: jobs.length ? undefined : error };
}

// ---------- We Work Remotely — public RSS of every category (robots allows it); keywords filter titles locally ----------
export const WWR_FEED = "https://weworkremotely.com/remote-jobs.rss";
export const mapWwr = (xml: string): NewJob[] =>
  parseRss(xml, WWR_FEED).map((j) => ({ ...j, source: "weworkremotely" as SourceKind, remote: true, location: j.location || "Anywhere" }));

async function scanWwr(_handle: string, keywords: string[] = []): Promise<Listed> {
  const { text: xml, error } = await getText(WWR_FEED, "application/rss+xml, application/xml;q=0.9");
  return error ? { jobs: [], error } : { jobs: byTitle(mapWwr(xml), keywords) };
}

export const scan = { remoteok: scanRemoteOk, jobicy: scanJobicy, himalayas: scanHimalayas, remotive: scanRemotive, aijobs: scanAiJobs, weworkremotely: scanWwr };
