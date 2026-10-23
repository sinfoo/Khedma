// Keyless employer job systems (ported from freehire, MIT): Workable, SmartRecruiters, Recruitee, Personio, Pinpoint, Workday, Teamtailor,
// BambooHR, Breezy, JOIN, softgarden, SAP SuccessFactors, iCIMS; plus the thehub.io and Hacker News "Who is hiring?" boards.
// Each lists one company's own board, so offers link to the employer's form, not an aggregator.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { decodeEntities, htmlToText, pickJsonLdJobPosting } from "./html";
import { getJson, getText, prettySlug } from "./http";
import { fromJsonLd, validatePublicUrl } from "./url";

type Scan = { jobs: NewJob[]; error?: string };
const join = (...parts: (string | null | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(", ");
const slugOf = (h: string) => h.trim().toLowerCase();

function job(p: { title: string; company: string; location: string; remote?: boolean; url: string; source: SourceKind; kind?: string; description: string; posted?: string | null }): NewJob {
  return {
    title: p.title.trim(),
    company: p.company,
    location: p.location,
    remote: !!p.remote || guessRemote(`${p.location} ${p.title}`),
    url: p.url,
    source: p.source,
    type: guessType(`${p.title} ${p.kind ?? ""}`, p.description),
    description: p.description,
    tags: extractTags(p.title, p.description),
    posted_at: normalizeDate(p.posted),
    deadline: null,
  };
}

// ---------- Workable: one widget call with details ----------
interface WorkablePayload {
  name?: string;
  jobs?: { title?: string; shortcode?: string; city?: string; state?: string; country?: string; telecommuting?: boolean; employment_type?: string; type?: string; published_on?: string; created_at?: string; description?: string; url?: string; shortlink?: string }[];
}
export function mapWorkable(json: WorkablePayload, slug: string): NewJob[] {
  return (json.jobs ?? [])
    .filter((j) => j.title && (j.url || j.shortlink || j.shortcode))
    .map((j) =>
      job({
        title: j.title!,
        company: json.name?.trim() || prettySlug(slug),
        location: join(j.city, j.state, j.country),
        remote: j.telecommuting,
        url: j.url || j.shortlink || `https://apply.workable.com/${slug}/j/${j.shortcode}/`,
        source: "workable",
        kind: j.employment_type ?? j.type,
        description: htmlToText(j.description ?? ""),
        posted: j.published_on ?? j.created_at,
      }),
    );
}
export async function workable(handle: string): Promise<Scan> {
  const slug = slugOf(handle);
  const { data, error } = await getJson<WorkablePayload>(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`);
  return data ? { jobs: mapWorkable(data, slug) } : { jobs: [], error };
}

// ---------- SmartRecruiters: offset pages, description from the per-posting detail ----------
interface SrPosting { id?: string; name?: string; releasedDate?: string; company?: { name?: string }; location?: { city?: string; region?: string; country?: string; remote?: boolean }; typeOfEmployment?: { label?: string } }
interface SrPage { totalFound?: number; content?: SrPosting[] }
export function mapSmartRecruiters(postings: SrPosting[], slug: string): NewJob[] {
  return postings
    .filter((p) => p.id && p.name)
    .map((p) =>
      job({
        title: p.name!,
        company: p.company?.name?.trim() || prettySlug(slug),
        location: join(p.location?.city, p.location?.region, p.location?.country?.toUpperCase()),
        remote: p.location?.remote,
        url: `https://jobs.smartrecruiters.com/${slug}/${p.id}`,
        source: "smartrecruiters",
        kind: p.typeOfEmployment?.label,
        description: "",
        posted: p.releasedDate,
      }),
    );
}
export async function smartRecruiters(handle: string): Promise<Scan> {
  const slug = slugOf(handle);
  const all: SrPosting[] = [];
  // ponytail: 5 pages of 100 is enough for one company; raise if a tracked employer lists more.
  for (let offset = 0; offset < 500; offset += 100) {
    const { data, error } = await getJson<SrPage>(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=100&offset=${offset}`);
    if (!data) return all.length ? { jobs: mapSmartRecruiters(all, slug) } : { jobs: [], error };
    all.push(...(data.content ?? []));
    if (!data.content?.length || offset + 100 >= (data.totalFound ?? 0)) break;
  }
  return { jobs: mapSmartRecruiters(all, slug) };
}
interface SrDetail { postingUrl?: string; jobAd?: { sections?: Record<string, { text?: string }> }; typeOfEmployment?: { label?: string } }
/** Only offers that passed the filter reach here, so the per-posting call stays small. */
export async function smartRecruitersDetail(j: NewJob): Promise<Partial<NewJob> | null> {
  const m = /jobs\.smartrecruiters\.com\/([^/]+)\/([^/?#]+)/.exec(j.url);
  if (!m) return null;
  const { data } = await getJson<SrDetail>(`https://api.smartrecruiters.com/v1/companies/${m[1]}/postings/${m[2]}`);
  if (!data) return null;
  const s = data.jobAd?.sections ?? {};
  const description = htmlToText([s.jobDescription?.text, s.qualifications?.text, s.additionalInformation?.text].filter(Boolean).join("\n") || s.companyDescription?.text || "");
  return { description, url: data.postingUrl || j.url, type: guessType(`${j.title} ${data.typeOfEmployment?.label ?? ""}`, description), tags: extractTags(j.title, description) };
}

// ---------- Recruitee: one call ----------
interface RecruiteePayload { offers?: { title?: string; careers_url?: string; careers_apply_url?: string; location?: string; city?: string; country?: string; remote?: boolean; created_at?: string; published_at?: string; description?: string; requirements?: string; employment_type_code?: string; company_name?: string }[] }
export function mapRecruitee(json: RecruiteePayload, slug: string): NewJob[] {
  return (json.offers ?? [])
    .filter((o) => o.title && o.careers_url)
    .map((o) =>
      job({
        title: o.title!,
        company: o.company_name?.trim() || prettySlug(slug),
        location: o.location || join(o.city, o.country),
        remote: o.remote,
        url: o.careers_url!,
        source: "recruitee",
        kind: o.employment_type_code,
        description: htmlToText(`${o.description ?? ""}\n${o.requirements ?? ""}`),
        posted: o.published_at ?? o.created_at,
      }),
    );
}
export async function recruitee(handle: string): Promise<Scan> {
  const slug = slugOf(handle);
  const { data, error } = await getJson<RecruiteePayload>(`https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`);
  return data ? { jobs: mapRecruitee(data, slug) } : { jobs: [], error };
}

// ---------- Personio: XML feed ----------
function xmlTag(xml: string, name: string): string {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return decodeEntities((m?.[1] ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "")).trim();
}
export function mapPersonio(xml: string, slug: string, host = `${slug}.jobs.personio.com`): NewJob[] {
  const out: NewJob[] = [];
  for (const m of xml.matchAll(/<position>([\s\S]*?)<\/position>/g)) {
    const p = m[1];
    const id = xmlTag(p, "id");
    const title = xmlTag(p, "name");
    if (!id || !title) continue;
    const body = [...p.matchAll(/<value>([\s\S]*?)<\/value>/g)].map((v) => decodeEntities(v[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, ""))).join("\n");
    out.push(
      job({
        title,
        company: xmlTag(p, "subcompany") || prettySlug(slug),
        location: xmlTag(p, "office"),
        url: `https://${host}/job/${id}`,
        source: "personio",
        kind: `${xmlTag(p, "employmentType")} ${xmlTag(p, "schedule")}`,
        description: htmlToText(body),
        posted: xmlTag(p, "createdAt"),
      }),
    );
  }
  return out;
}
export async function personio(handle: string): Promise<Scan> {
  const slug = slugOf(handle);
  for (const tld of ["com", "de"]) {
    const host = `${slug}.jobs.personio.${tld}`;
    const { text, error } = await getText(`https://${host}/xml`, "application/xml, text/xml;q=0.9");
    if (text) {
      const jobs = mapPersonio(text, slug, host);
      // Some boards leave the default-language bodies empty; the English feed usually has them (freehire does the same).
      if (jobs.length && jobs.every((j) => !j.description)) {
        const en = await getText(`https://${host}/xml?language=en`, "application/xml, text/xml;q=0.9");
        const withBody = en.text ? mapPersonio(en.text, slug, host) : [];
        if (withBody.some((j) => j.description)) return { jobs: withBody };
      }
      return { jobs };
    }
    if (tld === "de") return { jobs: [], error };
  }
  return { jobs: [] };
}

// ---------- Pinpoint: one call ----------
interface PinpointPayload { data?: { title?: string; url?: string; description?: string; key_responsibilities?: string; skills_knowledge_expertise?: string; workplace_type?: string; employment_type?: string; location?: { city?: string; province?: string; name?: string } }[] }
export function mapPinpoint(json: PinpointPayload, slug: string): NewJob[] {
  return (json.data ?? [])
    .filter((j) => j.title && j.url)
    .map((j) =>
      job({
        title: j.title!,
        company: prettySlug(slug),
        location: j.location?.name || join(j.location?.city, j.location?.province),
        remote: j.workplace_type === "remote",
        url: j.url!,
        source: "pinpoint",
        kind: j.employment_type,
        description: htmlToText([j.description, j.key_responsibilities, j.skills_knowledge_expertise].filter(Boolean).join("\n")),
      }),
    );
}
export async function pinpoint(handle: string): Promise<Scan> {
  const slug = slugOf(handle);
  const { data, error } = await getJson<PinpointPayload>(`https://${encodeURIComponent(slug)}.pinpointhq.com/postings.json`);
  return data ? { jobs: mapPinpoint(data, slug) } : { jobs: [], error };
}

// ---------- Workday: POST listing pages, description from the per-posting detail ----------
// Board = "host/site" (acme.wd5.myworkdayjobs.com/External) or "host/tenant/site" on the shared
// wdN.myworkdaysite.com hosts; a pasted careers URL works too (locale segments are skipped).
interface WdBoard { host: string; tenant: string; site: string; publicPath: string }
const WD_HOST = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$|^wd\d+\.myworkdaysite\.com$/;
const LOCALE_SEG = /^[a-z]{2}(-[a-z]{2})?$/i;
export function parseWorkdayBoard(handle: string): WdBoard | null {
  const [host, ...rest] = handle.trim().replace(/^https?:\/\//i, "").split(/[?#]/)[0].split("/").filter(Boolean);
  const h = host?.toLowerCase() ?? "";
  const m = WD_HOST.exec(h);
  if (!m) return null;
  const segs = rest.filter((s) => !LOCALE_SEG.test(s));
  if (m[1]) return segs[0] ? { host: h, tenant: m[1], site: segs[0], publicPath: segs[0] } : null;
  // wd1.myworkdaysite.com/recruiting/<tenant>/<site>
  const [tenant, site] = segs[0] === "recruiting" ? segs.slice(1) : segs;
  return tenant && site ? { host: h, tenant, site, publicPath: `recruiting/${tenant}/${site}` } : null;
}

/** "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" -> a date; "30+ Days Ago" is too vague. */
export function workdayPostedOn(s: string | undefined, now = Date.now()): string | null {
  const t = (s ?? "").toLowerCase();
  const n = /(\d+)\s*days? ago/.exec(t);
  const days = t.includes("today") ? 0 : t.includes("yesterday") ? 1 : n && !t.includes("+") ? Number(n[1]) : null;
  return days === null ? null : new Date(now - days * 86_400_000).toISOString().slice(0, 10);
}

interface WdPosting { title?: string; externalPath?: string; locationsText?: string; postedOn?: string }
export function mapWorkday(postings: WdPosting[], b: WdBoard): NewJob[] {
  return postings
    .filter((p) => p.title && p.externalPath)
    .map((p) => ({
      ...job({ title: p.title!, company: prettySlug(b.tenant), location: p.locationsText ?? "", url: `https://${b.host}/${b.publicPath}${p.externalPath}`, source: "workday", description: "" }),
      posted_at: workdayPostedOn(p.postedOn),
    }));
}
export async function workday(handle: string): Promise<Scan> {
  const b = parseWorkdayBoard(handle);
  if (!b) return { jobs: [], error: "Not a Workday careers URL (expected https://<company>.wdN.myworkdayjobs.com/<site>)" };
  const api = `https://${b.host}/wday/cxs/${b.tenant}/${b.site}/jobs`;
  const all: WdPosting[] = [];
  // Some boards report the real total only on the first page and 0 after it, so latch the first non-zero one.
  let total = -1;
  // ponytail: 25 pages of 20 per board; freehire walks facets past Workday's 2000 cap, a student's tracked employer never needs it.
  for (let page = 0; page < 25; page++) {
    const { data, error } = await getJson<{ total?: number; jobPostings?: WdPosting[] }>(api, { body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: all.length, searchText: "" }) });
    if (!data) return all.length ? { jobs: mapWorkday(all, b) } : { jobs: [], error };
    const got = data.jobPostings ?? [];
    all.push(...got);
    if (total < 0 && (data.total ?? 0) > 0) total = data.total!;
    if (!got.length || (total >= 0 && all.length >= total)) break;
  }
  return { jobs: mapWorkday(all, b) };
}
interface WdDetail { jobPostingInfo?: { jobDescription?: string; location?: string; startDate?: string; timeType?: string; remoteType?: string } }
/** Only offers that passed the filter and are not stored yet reach here. */
export async function workdayDetail(j: NewJob): Promise<Partial<NewJob> | null> {
  const [board, path] = j.url.replace(/^https:\/\//, "").split(/(?=\/job\/)/);
  const b = path ? parseWorkdayBoard(board) : null;
  if (!b) return null;
  const { data } = await getJson<WdDetail>(`https://${b.host}/wday/cxs/${b.tenant}/${b.site}${path}`);
  const info = data?.jobPostingInfo;
  if (!info) return null;
  const description = htmlToText(info.jobDescription ?? "");
  return {
    description,
    location: info.location || j.location,
    remote: j.remote || /remote/i.test(info.remoteType ?? ""),
    posted_at: normalizeDate(info.startDate) ?? j.posted_at,
    type: guessType(`${j.title} ${info.timeType ?? ""}`, description),
    tags: extractTags(j.title, description),
  };
}

// ---------- Teamtailor: paged HTML listing, description from each posting's JSON-LD ----------
const HTML = "text/html, application/xhtml+xml;q=0.9, */*;q=0.5";
/** Board = subdomain ("acme" for acme.teamtailor.com) or a custom careers host ("careers.acme.com"). */
const ttHost = (handle: string) => {
  const h = handle.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  return h.includes(".") ? h : `${h}.teamtailor.com`;
};
/** Posting links (/jobs/<id>-slug) on one listing page, titled by the link's title attribute or first text. */
export function teamtailorLinks(html: string, host: string): { url: string; title: string }[] {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']*\/jobs\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u: URL;
    try {
      u = new URL(decodeEntities(m[1]), `https://${host}/`);
    } catch {
      continue;
    }
    if (u.hostname !== host) continue;
    const url = `https://${host}${u.pathname}`;
    const text = /title\s*=\s*["']([^"']+)["']/i.exec(m[2])?.[1] ?? />\s*([^<>]*\S)\s*</.exec(`>${m[2]}<`)?.[1] ?? "";
    const title = decodeEntities(text).trim() || prettySlug(u.pathname.split("/").pop()!.replace(/^\d+-?/, ""));
    if (title && !out.get(url)) out.set(url, title);
  }
  return [...out.entries()].map(([url, title]) => ({ url, title }));
}
const ttJobs = (links: Map<string, string>, company: string) =>
  [...links].map(([url, title]) => job({ title, company, location: "", url, source: "teamtailor", description: "" }));
export async function teamtailor(handle: string): Promise<Scan> {
  const host = ttHost(handle);
  const { url, error } = validatePublicUrl(`https://${host}/jobs`);
  if (!url) return { jobs: [], error };
  const company = prettySlug(host.replace(/^(careers|jobs|career)\./, "").split(".")[0]);
  const seen = new Map<string, string>();
  // ponytail: 20 listing pages; freehire's ceiling is 1000, no student-tracked board comes close.
  for (let page = 1; page <= 20; page++) {
    const res = await getText(`https://${host}/jobs?page=${page}`, HTML);
    if (res.error) return seen.size ? { jobs: ttJobs(seen, company) } : { jobs: [], error: res.error };
    const before = seen.size;
    for (const l of teamtailorLinks(res.text, host)) if (!seen.has(l.url)) seen.set(l.url, l.title);
    if (seen.size === before) break;
  }
  return { jobs: ttJobs(seen, company) };
}
/** Only offers that passed the filter and are not stored yet reach here. */
export const teamtailorDetail = (j: NewJob) => ldDetail(j);

/** Detail from a posting page's schema.org JobPosting (Teamtailor, Breezy, softgarden, iCIMS, thehub…). */
export async function ldDetail(j: NewJob, page = j.url): Promise<Partial<NewJob> | null> {
  const { text } = await getText(page, HTML);
  const ld = text ? pickJsonLdJobPosting(text) : null;
  if (!ld) return null;
  const { title, company, location, remote, description, type, tags, posted_at, deadline } = fromJsonLd(ld, j.url);
  // iCIMS writes "UNAVAILABLE" for unknown address parts.
  return { title, company, location: location.split(", ").filter((p) => p !== "UNAVAILABLE").join(", "), remote, description, type, tags, posted_at, deadline };
}

// ---------- sitemaps (SuccessFactors, iCIMS) ----------
/** Page URLs (with lastmod) and child sitemaps of one sitemap.xml. */
export function parseSitemap(xml: string): { urls: { loc: string; lastmod: string | null }[]; sitemaps: string[] } {
  const loc = (b: string) => decodeEntities(/<loc>\s*([^<]+?)\s*<\/loc>/.exec(b)?.[1] ?? "");
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({ loc: loc(m[1]), lastmod: /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(m[1])?.[1] ?? null })).filter((u) => u.loc);
  const sitemaps = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/g)].map((m) => loc(m[1])).filter(Boolean);
  return { urls, sitemaps };
}
/** "Munich-Software-Intern" -> "Munich Software Intern": the only title a sitemap gives before the detail page. */
const slugTitle = (s: string) => {
  let t = s;
  try {
    t = decodeURIComponent(s);
  } catch {
    // keep the raw slug
  }
  return t.replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();
};
const publicHost = (h: string) => validatePublicUrl(`https://${h}/`).url?.hostname ?? null;
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};

// ---------- BambooHR: one list call, description from the per-opening detail ----------
interface BambooItem { id?: string | number; jobOpeningName?: string; location?: { city?: string; state?: string }; isRemote?: boolean | null; locationType?: string }
export function mapBamboo(items: BambooItem[], slug: string): NewJob[] {
  return items
    .filter((p) => p.id && p.jobOpeningName)
    .map((p) => job({ title: p.jobOpeningName!, company: prettySlug(slug), location: join(p.location?.city, p.location?.state), remote: !!p.isRemote || p.locationType === "1", url: `https://${slug}.bamboohr.com/careers/${p.id}`, source: "bamboohr", description: "" }));
}
export async function bamboohr(handle: string): Promise<Scan> {
  const slug = slugOf(handle);
  // A board that is not public redirects to bamboohr.com, so the JSON parse fails there.
  const { data, error } = await getJson<{ result?: BambooItem[] }>(`https://${encodeURIComponent(slug)}.bamboohr.com/careers/list`);
  return data ? { jobs: mapBamboo(data.result ?? [], slug) } : { jobs: [], error: error?.startsWith("Invalid JSON") ? `BambooHR board "${slug}" is not public` : error };
}
export async function bamboohrDetail(j: NewJob): Promise<Partial<NewJob> | null> {
  const m = /^https:\/\/([a-z0-9-]+)\.bamboohr\.com\/careers\/(\d+)$/.exec(j.url);
  if (!m) return null;
  const { data } = await getJson<{ result?: { jobOpening?: { description?: string; datePosted?: string; location?: { city?: string; state?: string; addressCountry?: string } } } }>(`https://${m[1]}.bamboohr.com/careers/${m[2]}/detail`);
  const o = data?.result?.jobOpening;
  if (!o) return null;
  const description = htmlToText(o.description ?? "");
  return { description, location: join(o.location?.city, o.location?.state, o.location?.addressCountry) || j.location, posted_at: normalizeDate(o.datePosted) ?? j.posted_at, type: guessType(j.title, description), tags: extractTags(j.title, description) };
}

// ---------- Breezy: /json listing, description from each position page's JSON-LD ----------
interface BreezyItem { name?: string; url?: string; published_date?: string; type?: { name?: string }; location?: { name?: string; city?: string; country?: { name?: string }; is_remote?: boolean }; company?: { name?: string } }
export function mapBreezy(items: BreezyItem[], slug: string): NewJob[] {
  return items
    .filter((p) => p.name && p.url?.startsWith(`https://${slug}.breezy.hr/`))
    .map((p) => job({ title: p.name!, company: p.company?.name?.trim() || prettySlug(slug), location: p.location?.name || join(p.location?.city, p.location?.country?.name), remote: p.location?.is_remote, url: p.url!, source: "breezy", kind: p.type?.name, description: "", posted: p.published_date }));
}
export async function breezy(handle: string): Promise<Scan> {
  const slug = slugOf(handle);
  const { data, error } = await getJson<BreezyItem[]>(`https://${encodeURIComponent(slug)}.breezy.hr/json`);
  return Array.isArray(data) ? { jobs: mapBreezy(data, slug) } : { jobs: [], error: error ?? "Unexpected Breezy response" };
}

// ---------- JOIN (join.com): paged public API, Markdown body from the per-job call ----------
interface JoinItem { id?: number; idParam?: string; title?: string; createdAt?: string; workplaceType?: string; city?: { cityName?: string; countryName?: string } | null }
export function mapJoin(items: JoinItem[], company: { name: string; domain: string }): NewJob[] {
  return items
    .filter((it) => it.id && it.title && it.idParam)
    .map((it) => job({ title: it.title!, company: company.name, location: join(it.city?.cityName, it.city?.countryName), remote: it.workplaceType === "REMOTE", url: `https://join.com/companies/${company.domain}/${it.idParam}`, source: "join", description: "", posted: it.createdAt }));
}
/** Board = the company slug from join.com/companies/<slug> (or its numeric id). */
export async function joinCom(handle: string): Promise<Scan> {
  const h = slugOf(handle).replace(/^https?:\/\/(www\.)?join\.com\/companies\//, "").split("/")[0];
  if (!/^[a-z0-9][a-z0-9._-]{0,80}$/.test(h)) return { jobs: [], error: "Invalid JOIN company" };
  let id = /^\d+$/.test(h) ? h : "";
  let company = { name: prettySlug(h), domain: h };
  if (id) {
    const { data } = await getJson<{ name?: string; domain?: string }>(`https://join.com/api/public/companies/${id}`);
    if (data?.domain) company = { name: data.name || company.name, domain: data.domain };
  } else {
    const page = await getText(`https://join.com/companies/${h}`, HTML);
    const m = new RegExp(`"id":(\\d+),"name":"([^"]*)","domain":"${h.replace(/\./g, "\\.")}"`).exec(page.text);
    if (!m) return { jobs: [], error: page.error ?? `JOIN company "${h}" not found` };
    id = m[1];
    company = { name: m[2] || company.name, domain: h };
  }
  const all: JoinItem[] = [];
  // ponytail: the public API caps pages at 5 offers; 20 pages (100 offers) covers a company board.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await getJson<{ items?: JoinItem[]; pagination?: { pageCount?: number } }>(`https://join.com/api/public/companies/${id}/jobs?page=${page}&pageSize=5`);
    if (!data) return all.length ? { jobs: mapJoin(all, company) } : { jobs: [], error };
    all.push(...(data.items ?? []));
    if (page >= (data.pagination?.pageCount ?? 0)) break;
  }
  return { jobs: mapJoin(all, company) };
}
export async function joinDetail(j: NewJob): Promise<Partial<NewJob> | null> {
  const id = /^https:\/\/join\.com\/companies\/[^/]+\/(\d+)/.exec(j.url)?.[1];
  if (!id) return null;
  const { data } = await getJson<{ description?: string }>(`https://join.com/api/public/jobs/${id}`);
  // The body is Markdown: kept as is, the offer page renders it.
  const description = data?.description?.trim();
  return description ? { description, type: guessType(j.title, description), tags: extractTags(j.title, description) } : null;
}

// ---------- softgarden: one listing page, description from each job page's JSON-LD ----------
export function softgardenLinks(html: string, slug: string): { url: string; title: string }[] {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["'][^"']*?\/job\/(\d+)\/([^"'?#/]*)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = `https://${slug}.softgarden.io/job/${m[1]}/${m[2]}`;
    const text = htmlToText(m[3]).replace(/\s+/g, " ").trim();
    if (!out.get(url)) out.set(url, text || slugTitle(m[2]));
  }
  return [...out].map(([url, title]) => ({ url, title }));
}
export async function softgarden(handle: string): Promise<Scan> {
  const slug = slugOf(handle);
  // ponytail: softgarden pages through a Wicket AJAX callback, so only the first listing page is read; tenants are small.
  const { text, error } = await getText(`https://${encodeURIComponent(slug)}.softgarden.io/`, HTML);
  if (error) return { jobs: [], error };
  return { jobs: softgardenLinks(text, slug).map((l) => job({ title: l.title, company: prettySlug(slug), location: "", url: l.url, source: "softgarden", description: "" })) };
}

// ---------- SAP SuccessFactors: job sitemap, description from each page's microdata ----------
/** Inner HTML of every element carrying itemprop="<name>", nested tags of the same name included. */
export function itemprops(html: string, name: string): string[] {
  const out: string[] = [];
  const opens = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*itemprop\\s*=\\s*["']${name}["'][^>]*>`, "gi");
  for (const open of html.matchAll(opens)) {
    const start = open.index + open[0].length;
    const re = new RegExp(`<(/?)${open[1]}\\b[^>]*>`, "gi");
    re.lastIndex = start;
    let depth = 1;
    let end = html.length;
    for (let m = re.exec(html); m; m = re.exec(html)) {
      depth += m[1] ? -1 : 1;
      if (!depth) {
        end = m.index;
        break;
      }
    }
    out.push(html.slice(start, end));
  }
  return out;
}
export function mapSuccessFactors(urls: { loc: string; lastmod: string | null }[], host: string): NewJob[] {
  const company = prettySlug(host.replace(/^(jobs|careers|career|karriere)\./, "").split(".")[0]);
  return urls.flatMap((u) => {
    const m = /\/job\/([^/]+)\/\d+[^/]*\/?$/.exec(u.loc);
    return m && hostOf(u.loc) === host ? [{ ...job({ title: slugTitle(m[1]), company, location: "", url: u.loc, source: "successfactors", description: "" }), posted_at: normalizeDate(u.lastmod) }] : [];
  });
}
/** Board = the career-site host (jobs.acme.com). */
export async function successFactors(handle: string): Promise<Scan> {
  const host = publicHost(handle.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]);
  if (!host) return { jobs: [], error: "Invalid SuccessFactors career-site host" };
  const { text, error } = await getText(`https://${host}/job_sitemap.xml`, "application/xml, text/xml;q=0.9");
  return error ? { jobs: [], error } : { jobs: mapSuccessFactors(parseSitemap(text).urls, host) };
}
export async function successFactorsDetail(j: NewJob): Promise<Partial<NewJob> | null> {
  const { text } = await getText(j.url, HTML);
  if (!text) return null;
  const title = htmlToText(itemprops(text, "title")[0] ?? "") || j.title;
  // The description is split over several itemprop sections (summary, tasks, profile…).
  const description = htmlToText(itemprops(text, "description").join("\n"));
  if (!description) return null;
  return { title, description, type: guessType(title, description), tags: extractTags(title, description) };
}

// ---------- iCIMS: sitemap(s), description from the posting's iframe fragment JSON-LD ----------
/** Board = the iCIMS slug (careers-<slug>.icims.com) or a vanity careers host. */
const icimsHost = (handle: string) => {
  const h = handle.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  return h.includes(".") ? publicHost(h) : /^[a-z0-9-]+$/.test(h) ? `careers-${h}.icims.com` : null;
};
export function mapIcims(urls: { loc: string; lastmod: string | null }[], host: string): NewJob[] {
  const company = prettySlug(host.replace(/^careers-|\.icims\.com$/g, "").replace(/^(careers|jobs)\./, "").split(".")[0]);
  return urls.flatMap((u) => {
    const m = /\/jobs\/(\d+)\/([^/?#]+)/.exec(u.loc);
    return m && hostOf(u.loc) === host ? [{ ...job({ title: slugTitle(m[2]), company, location: "", url: u.loc, source: "icims", description: "" }), posted_at: normalizeDate(u.lastmod) }] : [];
  });
}
export async function icims(handle: string): Promise<Scan> {
  const host = icimsHost(handle);
  if (!host) return { jobs: [], error: "Invalid iCIMS board" };
  const root = await getText(`https://${host}/sitemap.xml`, "application/xml, text/xml;q=0.9");
  if (root.error) return { jobs: [], error: root.error };
  const map = parseSitemap(root.text);
  // ponytail: first 5 child sitemaps on the same host; vanity sites split by locale and the first ones hold the postings.
  for (const sm of map.sitemaps.filter((u) => hostOf(u) === host).slice(0, 5)) {
    const sub = await getText(sm, "application/xml, text/xml;q=0.9");
    map.urls.push(...parseSitemap(sub.text).urls);
  }
  return { jobs: mapIcims(map.urls, host) };
}
export async function icimsDetail(j: NewJob): Promise<Partial<NewJob> | null> {
  const host = hostOf(j.url);
  const id = /\/jobs\/(\d+)/.exec(j.url)?.[1];
  if (!id) return null;
  // The canonical page is a JS wrapper; the ?in_iframe=1 fragment is server-rendered (vanity sites serve it under /careers-home).
  const frag = host.endsWith(".icims.com") ? `${j.url.split("?")[0]}?in_iframe=1` : `https://${host}/careers-home/jobs/${id}?in_iframe=1`;
  return ldDetail(j, frag);
}

// ---------- thehub.io (Nordic startups): keyword search pages, description from JSON-LD ----------
export function mapTheHub(html: string): NewJob[] {
  return html.split(/class="card card-job-find-list"/).slice(1).flatMap((card) => {
    const id = /href="\/jobs\/([0-9a-f]{24})"/.exec(card)?.[1];
    const title = htmlToText(/card-job-find-list__position">([\s\S]*?)<\/span>/.exec(card)?.[1] ?? "");
    if (!id || !title) return [];
    const bullets = /bullet-inline-list[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1] ?? "";
    const [company = "", location = "", kind = ""] = [...bullets.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => htmlToText(m[1]));
    return [job({ title, company: company || "thehub.io", location, url: `https://thehub.io/jobs/${id}`, source: "thehub", kind, description: "" })];
  });
}
export async function theHub(keywords: string[]): Promise<Scan> {
  const seen = new Map<string, NewJob>();
  let error: string | undefined;
  // ponytail: 3 result pages for each of the first 3 keywords; the board sorts by relevance.
  for (const kw of (keywords.length ? keywords : ["intern"]).slice(0, 3)) {
    for (let page = 1; page <= 3; page++) {
      const res = await getText(`https://thehub.io/jobs?${new URLSearchParams({ search: kw, page: String(page) })}`, HTML);
      if (res.error) {
        error = res.error;
        break;
      }
      const jobs = mapTheHub(res.text);
      for (const j of jobs) if (!seen.has(j.url)) seen.set(j.url, j);
      if (jobs.length < 15) break;
    }
  }
  return { jobs: [...seen.values()], error: seen.size ? undefined : error };
}

// ---------- Hacker News "Ask HN: Who is hiring?" (public Algolia HN API) ----------
interface HnItem { id?: number; text?: string | null; created_at?: string; children?: HnItem[] }
const HN_SENIOR_LEAD = /^(sr|jr|senior|junior|staff|principal|lead|founding|head|director|vp|chief)\b/i;
const HN_ROLE = /\b(engineer|engineering|developer|designer|scientist|analyst|architect|manager|programmer|devops|sre|researcher)\b/i;
const HN_NOT_PLACE = /^(full[ -]?time|part[ -]?time|contract(or)?|intern(ship)?s?|permanent|freelance|remote|onsite|on-site|hybrid)$|^[$€£¥]|^\d/i;
/** Top-level comment "Company | Role | Location | …" -> an offer; free-form posts are skipped. */
export function mapHnComment(c: HnItem): NewJob | null {
  if (!c.id || !c.text) return null;
  const head = htmlToText(c.text.split(/<p\b/i)[0]).replace(/\s+/g, " ");
  const parts = head.split("|").map((p) => p.replace(/https?:\/\/\S+/g, "").replace(/[()]/g, " ").replace(/\s+/g, " ").trim());
  if (parts.length < 2 || !parts[0] || !parts[1] || (HN_SENIOR_LEAD.test(parts[0]) && HN_ROLE.test(parts[0]))) return null;
  // HN escapes the slashes inside hrefs ("https:&#x2F;&#x2F;…").
  const link = [...c.text.matchAll(/href="([^"]+)"/g)].map((m) => decodeEntities(m[1])).find((u) => /^https?:\/\//.test(u));
  // Posters order the fields freely ("Acme | ONSITE | Backend Engineer"): the role is the first field naming one.
  const title = parts.slice(1).find((p) => HN_ROLE.test(p) || /\b(intern(ship)?|stage|werkstudent)\b/i.test(p)) ?? parts.slice(1).find((p) => p && !HN_NOT_PLACE.test(p)) ?? parts[1];
  return job({
    title: title.slice(0, 140),
    company: parts[0].slice(0, 80),
    location: parts.slice(2).find((p) => p && !HN_NOT_PLACE.test(p)) ?? "",
    remote: /\bremote\b/i.test(parts.slice(1).join(" ")),
    url: link ?? `https://news.ycombinator.com/item?id=${c.id}`,
    source: "hackernews",
    kind: parts.slice(1).join(" "),
    description: htmlToText(c.text),
    posted: c.created_at,
  });
}
export async function hackerNews(): Promise<Scan> {
  const { data, error } = await getJson<{ hits?: { objectID?: string; title?: string }[] }>("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5");
  const thread = data?.hits?.find((h) => /who is hiring/i.test(h.title ?? ""));
  if (!thread?.objectID || !/^\d+$/.test(thread.objectID)) return { jobs: [], error: error ?? "No \"Who is hiring?\" thread found" };
  // The whole thread (hundreds of comments, a few MB) comes in one response.
  const item = await getText(`https://hn.algolia.com/api/v1/items/${thread.objectID}`, "application/json", { timeoutMs: 30_000 });
  if (item.error) return { jobs: [], error: item.error };
  try {
    return { jobs: ((JSON.parse(item.text) as HnItem).children ?? []).map(mapHnComment).filter((j): j is NewJob => !!j) };
  } catch {
    return { jobs: [], error: "Invalid JSON from the HN API" };
  }
}

// ---------- Gem, Rippling, Flatchr, JobScore: public board APIs (endpoints after elliottdehn/open-jobs, CC0) ----------
interface GemPost { title?: string; absolute_url?: string; content_plain?: string; content?: string; location?: { name?: string }; location_type?: string; employment_type?: string; first_published_at?: string; created_at?: string }
export function mapGem(posts: GemPost[], slug: string): NewJob[] {
  return posts
    .filter((p) => p.title && p.absolute_url)
    .map((p) =>
      job({
        title: p.title!,
        company: prettySlug(slug),
        location: p.location?.name ?? "",
        // in_office / hybrid / remote: only a fully remote post counts as remote.
        remote: p.location_type === "remote",
        url: p.absolute_url!,
        source: "gem",
        kind: p.employment_type,
        description: p.content_plain?.trim() || htmlToText(p.content ?? ""),
        posted: p.first_published_at ?? p.created_at,
      }),
    );
}
export async function gem(handle: string): Promise<Scan> {
  const slug = slugOf(handle);
  const { data, error } = await getJson<GemPost[]>(`https://api.gem.com/job_board/v0/${encodeURIComponent(slug)}/job_posts/`);
  if (!data) return { jobs: [], error };
  return Array.isArray(data) ? { jobs: mapGem(data, slug) } : { jobs: [], error: `Unexpected Gem response for ${slug}` };
}

interface RipplingItem { uuid?: string; name?: string; url?: string; workLocation?: { label?: string } }
export function mapRippling(items: RipplingItem[], slug: string): NewJob[] {
  return items
    .filter((i) => i.name?.trim() && i.url)
    .map((i) => job({ title: i.name!, company: prettySlug(slug), location: i.workLocation?.label ?? "", url: i.url!, source: "rippling", description: "" }));
}
/** The whole board in one call; descriptions come from the per-job detail. */
export async function rippling(handle: string): Promise<Scan> {
  const slug = slugOf(handle);
  const { data, error } = await getJson<RipplingItem[]>(`https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(slug)}/jobs`);
  if (!data) return { jobs: [], error };
  return Array.isArray(data) ? { jobs: mapRippling(data, slug) } : { jobs: [], error: `Unexpected Rippling response for ${slug}` };
}
interface RipplingDetail { description?: { company?: string; role?: string }; workLocations?: string[]; employmentType?: { id?: string }; createdOn?: string; companyName?: string; payRangeDetails?: { currency?: string; frequency?: string; rangeStart?: number; rangeEnd?: number; isRemote?: boolean }[] }
export async function ripplingDetail(j: NewJob): Promise<Partial<NewJob> | null> {
  const m = /ats\.rippling\.com\/([^/]+)\/jobs\/([0-9a-f-]{36})/i.exec(j.url);
  if (!m) return null;
  const { data } = await getJson<RipplingDetail>(`https://ats.rippling.com/api/v2/board/${m[1]}/jobs/${m[2]}`);
  if (!data) return null;
  const pay = data.payRangeDetails?.find((p) => p.rangeStart);
  const salary = pay ? `\n\nSalary: ${pay.currency ?? ""} ${pay.rangeStart} - ${pay.rangeEnd ?? pay.rangeStart} per ${String(pay.frequency ?? "year").toLowerCase()}` : "";
  const description = `${htmlToText(data.description?.role ?? "")}\n\n${htmlToText(data.description?.company ?? "")}`.trim() + salary;
  return {
    company: data.companyName?.trim() || j.company,
    location: data.workLocations?.join(" · ") || j.location,
    remote: j.remote || !!pay?.isRemote,
    description,
    type: guessType(`${j.title} ${data.employmentType?.id ?? ""}`, description),
    tags: extractTags(j.title, description),
    posted_at: normalizeDate(data.createdOn) ?? j.posted_at,
  };
}

// Flatchr (French SMEs): full offers with salary, contract and remote policy in one company JSON.
interface FlatchrVacancy { title?: string; slug?: string; description?: string; mission?: string; profile?: string; salary?: number | null; salary_max?: number | null; currency?: string; mensuality?: string; remote?: string; contract_type?: string; addressFormatted?: string; address?: { locality?: string }; company?: { name?: string }; created_at?: string; start_date?: string | null }
export function mapFlatchr(json: { items?: { vacancy?: FlatchrVacancy; published?: boolean }[] }, slug: string): NewJob[] {
  return (json.items ?? [])
    .filter((i) => i.published !== false && i.vacancy?.title && i.vacancy.slug)
    .map(({ vacancy: v }) => {
      const pay = v!.salary ? `Salaire : ${v!.salary}${v!.salary_max && v!.salary_max !== v!.salary ? ` - ${v!.salary_max}` : ""} ${v!.currency ?? "EUR"} ${v!.mensuality === "m" ? "par mois" : "par an"}` : "";
      const description = [v!.description, v!.mission, v!.profile].map((h) => htmlToText(h ?? "")).filter(Boolean).join("\n\n") + (pay ? `\n\n${pay}` : "");
      return job({
        title: v!.title!,
        company: v!.company?.name?.trim() || prettySlug(slug),
        location: v!.address?.locality || v!.addressFormatted || "",
        // "notime" = no remote; only a value saying full remote counts (partial remote days don't).
        remote: /full|total/i.test(v!.remote ?? ""),
        url: `https://careers.flatchr.io/company/${slug}/vacancy/${v!.slug}/`,
        source: "flatchr",
        kind: v!.contract_type,
        description,
        posted: v!.created_at,
      });
    });
}
export async function flatchr(handle: string): Promise<Scan> {
  const slug = slugOf(handle);
  const { data, error } = await getJson<{ items?: { vacancy?: FlatchrVacancy; published?: boolean }[] }>(`https://careers.flatchr.io/company/${encodeURIComponent(slug)}.json`);
  return data ? { jobs: mapFlatchr(data, slug) } : { jobs: [], error };
}

interface JobScoreFeed { company_name?: string; jobs?: { title?: string; detail_url?: string; location?: string; city?: string; state?: string; country?: string; description?: string; job_type?: string; opened_date?: string; created_on?: string }[] }
export function mapJobScore(json: JobScoreFeed, slug: string): NewJob[] {
  return (json.jobs ?? [])
    .filter((j) => j.title && j.detail_url)
    .map((j) =>
      job({
        title: j.title!,
        company: json.company_name?.trim() || prettySlug(slug),
        location: j.location || join(j.city, j.state, j.country),
        url: j.detail_url!,
        source: "jobscore",
        kind: j.job_type,
        description: htmlToText(j.description ?? ""),
        posted: j.opened_date ?? j.created_on,
      }),
    );
}
export async function jobScore(handle: string): Promise<Scan> {
  const slug = slugOf(handle);
  const { data, error } = await getJson<JobScoreFeed>(`https://careers.jobscore.com/careers/${encodeURIComponent(slug)}/feed.json`);
  return data ? { jobs: mapJobScore(data, slug) } : { jobs: [], error };
}
