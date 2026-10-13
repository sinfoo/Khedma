// Aggregator APIs that hand out free developer keys. Keys live in .env.local; the names come from the
// catalog entry's `needsEnv`, so a missing key yields a clear scan error instead of a request.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { CATALOG } from "./catalog";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { decodeEntities, htmlToText } from "./html";
import { getJson } from "./http";

type Listed = { jobs: NewJob[]; error?: string };
const text = (html?: string) => htmlToText(decodeEntities(html ?? ""));

/** Env values for a keyed provider, or the error to show when one is missing. */
function envFor(kind: string): { keys: string[]; error?: string } {
  const names = CATALOG.find((c) => c.kind === kind)?.needsEnv ?? [];
  const missing = names.filter((n) => !process.env[n]?.trim());
  return missing.length ? { keys: [], error: `Missing env: ${missing.join(", ")}` } : { keys: names.map((n) => process.env[n]!.trim()) };
}

// ---------- Adzuna — https://developer.adzuna.com (free app id + key, 19 countries) ----------
interface AdzunaJob { id?: string; title?: string; description?: string; redirect_url?: string; company?: { display_name?: string }; location?: { display_name?: string }; created?: string; contract_type?: string; contract_time?: string }
export interface AdzunaPayload { results?: AdzunaJob[] }
export const adzunaUrl = (country: string, what: string, appId: string, appKey: string) =>
  `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${new URLSearchParams({ app_id: appId, app_key: appKey, what, results_per_page: "50", "content-type": "application/json" })}`;

export function mapAdzuna(json: AdzunaPayload, country: string): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.results ?? []) {
    if (!j.title || !j.redirect_url) continue;
    const title = text(j.title);
    const description = text(j.description);
    const location = j.location?.display_name?.trim() || country.toUpperCase();
    out.push({
      title, company: j.company?.display_name?.trim() || "Adzuna", location, remote: guessRemote(`${title} ${location}`),
      url: j.redirect_url, source: "adzuna" as SourceKind,
      type: guessType(`${title} ${j.contract_type ?? ""}`, description), description, tags: extractTags(title, description),
      posted_at: normalizeDate(j.created), deadline: null,
    });
  }
  return out;
}

async function scanAdzuna(handle: string, keywords: string[] = []): Promise<Listed> {
  const { keys: [appId, appKey], error } = envFor("adzuna");
  if (error) return { jobs: [], error };
  const country = handle || "fr";
  const jobs: NewJob[] = [];
  let err: string | undefined;
  for (const kw of keywords.length ? keywords.slice(0, 2) : ["intern"]) {
    const { data, error: e } = await getJson<AdzunaPayload>(adzunaUrl(country, kw, appId, appKey));
    if (data) jobs.push(...mapAdzuna(data, country));
    else err = e;
  }
  return { jobs, error: jobs.length ? undefined : err };
}

// ---------- Jooble — https://jooble.org/api/about (free key, POST JSON; Tunisia included) ----------
interface JoobleJob { id?: number | string; title?: string; location?: string; snippet?: string; type?: string; link?: string; company?: string; updated?: string }
export interface JooblePayload { totalCount?: number; jobs?: JoobleJob[] }
export const joobleUrl = (key: string) => `https://jooble.org/api/${encodeURIComponent(key)}`;

export function mapJooble(json: JooblePayload, fallbackLocation: string): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.jobs ?? []) {
    if (!j.title || !j.link) continue;
    const title = text(j.title);
    const description = text(j.snippet);
    const location = j.location?.trim() || fallbackLocation;
    out.push({
      title, company: j.company?.trim() || "Jooble", location, remote: guessRemote(`${title} ${location}`),
      url: j.link, source: "jooble" as SourceKind,
      type: guessType(`${title} ${j.type ?? ""}`, description), description, tags: extractTags(title, description),
      posted_at: normalizeDate(j.updated), deadline: null,
    });
  }
  return out;
}

async function scanJooble(handle: string, keywords: string[] = []): Promise<Listed> {
  const { keys: [key], error } = envFor("jooble");
  if (error) return { jobs: [], error };
  const location = handle || "tunisia";
  const jobs: NewJob[] = [];
  let err: string | undefined;
  for (const kw of keywords.length ? keywords.slice(0, 2) : ["stage"]) {
    const { data, error: e } = await getJson<JooblePayload>(joobleUrl(key), { body: JSON.stringify({ keywords: kw, location, page: 1 }) });
    if (data) jobs.push(...mapJooble(data, location));
    else err = e;
  }
  return { jobs, error: jobs.length ? undefined : err };
}

// ---------- Reed — https://www.reed.co.uk/developers (free key as Basic-auth user, UK) ----------
interface ReedJob { jobId?: number; employerName?: string; jobTitle?: string; locationName?: string; expirationDate?: string; date?: string; jobDescription?: string; jobUrl?: string }
export interface ReedPayload { results?: ReedJob[] }
export const reedUrl = (keywords: string) => `https://www.reed.co.uk/api/1.0/search?${new URLSearchParams({ keywords, resultsToTake: "100" })}`;
/** Reed writes dates as dd/mm/yyyy. */
const dmy = (s?: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : normalizeDate(s);
};

export function mapReed(json: ReedPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.results ?? []) {
    if (!j.jobTitle || !j.jobUrl) continue;
    const title = text(j.jobTitle);
    const description = text(j.jobDescription);
    const location = j.locationName?.trim() ? `${j.locationName.trim()}, United Kingdom` : "United Kingdom";
    out.push({
      title, company: j.employerName?.trim() || "Reed", location, remote: guessRemote(`${title} ${location}`),
      url: j.jobUrl, source: "reed" as SourceKind,
      type: guessType(title, description), description, tags: extractTags(title, description),
      posted_at: dmy(j.date), deadline: dmy(j.expirationDate),
    });
  }
  return out;
}

async function scanReed(_handle: string, keywords: string[] = []): Promise<Listed> {
  const { keys: [key], error } = envFor("reed");
  if (error) return { jobs: [], error };
  const auth = { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` };
  const jobs: NewJob[] = [];
  let err: string | undefined;
  for (const kw of keywords.length ? keywords.slice(0, 2) : ["graduate software"]) {
    const { data, error: e } = await getJson<ReedPayload>(reedUrl(kw), { headers: auth });
    if (data) jobs.push(...mapReed(data));
    else err = e;
  }
  return { jobs, error: jobs.length ? undefined : err };
}

// ---------- Findwork — https://findwork.dev/developers (free token, mostly remote / US) ----------
interface FindworkJob { id?: string; role?: string; company_name?: string; employment_type?: string | null; location?: string | null; remote?: boolean; url?: string; text?: string; date_posted?: string; keywords?: string[] }
export interface FindworkPayload { results?: FindworkJob[] }
export const findworkUrl = (search: string) => `https://findwork.dev/api/jobs/?${new URLSearchParams({ search, sort_by: "relevance" })}`;

export function mapFindwork(json: FindworkPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.results ?? []) {
    if (!j.role || !j.url) continue;
    const title = text(j.role);
    const description = text(j.text);
    const location = j.location?.trim() || (j.remote ? "Remote" : "");
    out.push({
      title, company: j.company_name?.trim() || "Findwork", location, remote: !!j.remote || guessRemote(`${title} ${location}`),
      url: j.url, source: "findwork" as SourceKind,
      type: guessType(`${title} ${j.employment_type ?? ""}`, description), description, tags: extractTags(`${title} ${(j.keywords ?? []).join(" ")}`, description),
      posted_at: normalizeDate(j.date_posted), deadline: null,
    });
  }
  return out;
}

async function scanFindwork(_handle: string, keywords: string[] = []): Promise<Listed> {
  const { keys: [key], error } = envFor("findwork");
  if (error) return { jobs: [], error };
  const auth = { Authorization: `Token ${key}` };
  const jobs: NewJob[] = [];
  let err: string | undefined;
  for (const kw of keywords.length ? keywords.slice(0, 2) : ["intern"]) {
    const { data, error: e } = await getJson<FindworkPayload>(findworkUrl(kw), { headers: auth });
    if (data) jobs.push(...mapFindwork(data));
    else err = e;
  }
  return { jobs, error: jobs.length ? undefined : err };
}

export const scan = { adzuna: scanAdzuna, jooble: scanJooble, reed: scanReed, findwork: scanFindwork };
