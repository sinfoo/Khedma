// Aggregator APIs that hand out free developer keys. Keys live in .env.local; the names come from the
// catalog entry's `needsEnv`, so a missing key yields a clear scan error instead of a request.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { CATALOG } from "./catalog";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { decodeEntities, htmlToText } from "./html";
import { getJson, getText } from "./http";

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

// ---------- France Travail Offres d'emploi v2 — https://francetravail.io (free OAuth client credentials) ----------
interface FtOffer {
  id?: string; intitule?: string; description?: string; dateCreation?: string; typeContrat?: string; typeContratLibelle?: string; natureContrat?: string;
  alternance?: boolean; experienceLibelle?: string; lieuTravail?: { libelle?: string }; entreprise?: { nom?: string }; salaire?: { libelle?: string };
  origineOffre?: { urlOrigine?: string };
}
export interface FtPayload { resultats?: FtOffer[] }
const FT_TOKEN = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
export const ftSearchUrl = (motsCles: string) => `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${new URLSearchParams({ motsCles, range: "0-149" })}`;
export const ftPostingUrl = (id: string) => `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(id)}`;

/** "75 - Paris 15e Arrondissement" -> "Paris 15e Arrondissement, France". */
const ftPlace = (s?: string) => {
  const p = (s ?? "").replace(/^\d+[AB]?\s*-\s*/, "").trim();
  return !p ? "France" : /\bfrance\b/i.test(p) ? p : `${p}, France`;
};

export function mapFranceTravail(json: FtPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.resultats ?? []) {
    if (!j.intitule || !j.id) continue;
    const title = j.intitule.trim();
    const body = j.description?.trim() ?? "";
    const head = [
      [j.typeContratLibelle, j.natureContrat].filter(Boolean).join(" · ") && `Contract: ${[j.typeContratLibelle, j.natureContrat].filter(Boolean).join(" · ")}`,
      j.experienceLibelle && `Experience: ${j.experienceLibelle}`,
      j.salaire?.libelle && `Salary: ${j.salaire.libelle}`,
    ].filter(Boolean).join("\n");
    const description = [head, body].filter(Boolean).join("\n\n");
    const location = ftPlace(j.lieuTravail?.libelle);
    // Apprenticeship and professionalisation contracts are alternance; the contract code alone does not say so.
    const kind = j.alternance || /apprentissage|professionnalisation/i.test(j.natureContrat ?? "") ? "alternance" : "";
    out.push({
      title, company: j.entreprise?.nom?.trim() || "France Travail", location, remote: guessRemote(`${title} ${body.slice(0, 400)}`),
      url: j.origineOffre?.urlOrigine || ftPostingUrl(j.id), source: "francetravail" as SourceKind,
      type: guessType(`${title} ${kind}`, body), description, tags: extractTags(title, body),
      posted_at: normalizeDate(j.dateCreation), deadline: null,
    });
  }
  return out;
}

let ftToken: { value: string; until: number; id: string } | null = null;
async function franceTravailToken(id: string, secret: string): Promise<{ token?: string; error?: string }> {
  if (ftToken && ftToken.id === id && Date.now() < ftToken.until) return { token: ftToken.value };
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret, scope: "api_offresdemploiv2 o2dsoffre" }).toString();
  const { data, error } = await getJson<{ access_token?: string; expires_in?: number }>(FT_TOKEN, { body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (!data?.access_token) return { error: error ?? "France Travail: no access token" };
  // Renew a minute early so a scan never sends an expiring token.
  ftToken = { value: data.access_token, until: Date.now() + Math.max(0, (data.expires_in ?? 1500) - 60) * 1000, id };
  return { token: data.access_token };
}

async function scanFranceTravail(_handle: string, keywords: string[] = []): Promise<Listed> {
  const { keys: [id, secret], error } = envFor("francetravail");
  if (error) return { jobs: [], error };
  const tok = await franceTravailToken(id, secret);
  if (!tok.token) return { jobs: [], error: tok.error };
  const jobs: NewJob[] = [];
  let err: string | undefined;
  for (const kw of keywords.length ? keywords.slice(0, 2) : ["stage informatique"]) {
    const { text: body, error: e } = await getText(ftSearchUrl(kw), "application/json", { headers: { Authorization: `Bearer ${tok.token}` } });
    if (e) {
      err = e;
      continue;
    }
    if (!body.trim()) continue; // 204: no offer for this keyword
    try {
      jobs.push(...mapFranceTravail(JSON.parse(body) as FtPayload));
    } catch {
      err = "Invalid JSON from France Travail";
    }
  }
  return { jobs, error: jobs.length ? undefined : err };
}

// ---------- ITJobs.pt — https://www.itjobs.pt/api (free key by e-mail, Portugal) ----------
interface ItjobsJob { id?: number; title?: string; body?: string; slug?: string; publishedAt?: string; allowRemote?: boolean; company?: { name?: string }; locations?: { name?: string }[]; types?: { name?: string }[]; contracts?: { name?: string }[]; wage?: string | null }
export interface ItjobsPayload { total?: number; results?: ItjobsJob[] }
export const itjobsUrl = (key: string, q: string) => `https://api.itjobs.pt/job/search.json?${new URLSearchParams({ api_key: key, q, limit: "100" })}`;

export function mapItjobs(json: ItjobsPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.results ?? []) {
    if (!j.title || !j.id) continue;
    const title = text(j.title);
    const body = text(j.body);
    const names = (xs?: { name?: string }[]) => (xs ?? []).map((x) => x.name?.trim()).filter(Boolean).join(", ");
    const head = [names(j.types) && `Type: ${names(j.types)}`, names(j.contracts) && `Contract: ${names(j.contracts)}`, j.wage && `Salary: ${text(j.wage)}`].filter(Boolean).join("\n");
    const location = [names(j.locations), "Portugal"].filter(Boolean).join(", ");
    out.push({
      title, company: j.company?.name?.trim() || "ITJobs", location, remote: !!j.allowRemote || guessRemote(`${title} ${location}`),
      url: `https://www.itjobs.pt/oferta/${j.id}/${j.slug ?? ""}`.replace(/\/$/, ""), source: "itjobs" as SourceKind,
      type: guessType(`${title} ${names(j.types)} ${names(j.contracts)}`, body), description: [head, body].filter(Boolean).join("\n\n"), tags: extractTags(title, body),
      posted_at: normalizeDate(j.publishedAt), deadline: null,
    });
  }
  return out;
}

async function scanItjobs(_handle: string, keywords: string[] = []): Promise<Listed> {
  const { keys: [key], error } = envFor("itjobs");
  if (error) return { jobs: [], error };
  const jobs: NewJob[] = [];
  let err: string | undefined;
  for (const kw of keywords.length ? keywords.slice(0, 2) : ["estágio"]) {
    const { data, error: e } = await getJson<ItjobsPayload>(itjobsUrl(key, kw));
    if (data) jobs.push(...mapItjobs(data));
    else err = e;
  }
  return { jobs, error: jobs.length ? undefined : err };
}

// ---------- InfoJobs — https://developer.infojobs.net (free app id + secret as Basic auth, Spain) ----------
interface InfojobsOffer { id?: string; title?: string; city?: string; province?: { value?: string }; link?: string; published?: string; requirementMin?: string; author?: { name?: string }; contractType?: { value?: string }; workDay?: { value?: string }; experienceMin?: { value?: string }; teleworking?: { value?: string } }
export interface InfojobsPayload { totalResults?: number; offers?: InfojobsOffer[] }
export const infojobsUrl = (q: string) => `https://api.infojobs.net/api/9/offer?${new URLSearchParams({ q, maxResults: "50" })}`;

export function mapInfojobs(json: InfojobsPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.offers ?? []) {
    if (!j.title || !j.link) continue;
    const title = text(j.title);
    const body = text(j.requirementMin);
    const head = [j.contractType?.value && `Contract: ${j.contractType.value}`, j.workDay?.value && `Hours: ${j.workDay.value}`, j.experienceMin?.value && `Experience: ${j.experienceMin.value}`, j.teleworking?.value && `Remote work: ${j.teleworking.value}`].filter(Boolean).join("\n");
    const city = j.city?.trim();
    const province = j.province?.value?.trim();
    const location = [city, province && province.toLowerCase() !== city?.toLowerCase() ? province : "", "Spain"].filter(Boolean).join(", ");
    out.push({
      title, company: j.author?.name?.trim() || "InfoJobs", location, remote: /solo teletrabajo|remoto/i.test(j.teleworking?.value ?? "") || guessRemote(title),
      url: j.link, source: "infojobs" as SourceKind,
      // "Prácticas" is Spanish for internship; the contract type names it.
      type: guessType(`${title} ${/pr[aá]cticas|formaci[oó]n/i.test(`${title} ${j.contractType?.value ?? ""}`) ? "internship" : ""}`, body),
      description: [head, body].filter(Boolean).join("\n\n"), tags: extractTags(title, body),
      posted_at: normalizeDate(j.published), deadline: null,
    });
  }
  return out;
}

async function scanInfojobs(_handle: string, keywords: string[] = []): Promise<Listed> {
  const { keys: [id, secret], error } = envFor("infojobs");
  if (error) return { jobs: [], error };
  const auth = { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` };
  const jobs: NewJob[] = [];
  let err: string | undefined;
  for (const kw of keywords.length ? keywords.slice(0, 2) : ["prácticas informática"]) {
    const { data, error: e } = await getJson<InfojobsPayload>(infojobsUrl(kw), { headers: auth });
    if (data) jobs.push(...mapInfojobs(data));
    else err = e;
  }
  return { jobs, error: jobs.length ? undefined : err };
}

export const scan = { adzuna: scanAdzuna, jooble: scanJooble, reed: scanReed, findwork: scanFindwork, francetravail: scanFranceTravail, itjobs: scanItjobs, infojobs: scanInfojobs };
