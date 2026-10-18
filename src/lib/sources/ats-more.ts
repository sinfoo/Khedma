// Keyless employer job systems (ported from freehire, MIT): Workable, SmartRecruiters, Recruitee, Personio, Pinpoint, Workday, Teamtailor.
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
export async function teamtailorDetail(j: NewJob): Promise<Partial<NewJob> | null> {
  const { text } = await getText(j.url, HTML);
  const ld = text ? pickJsonLdJobPosting(text) : null;
  if (!ld) return null;
  const { title, location, remote, description, type, tags, posted_at, deadline } = fromJsonLd(ld, j.url);
  return { title, location, remote, description, type, tags, posted_at, deadline };
}
