// Keyless employer job systems (ported from freehire, MIT): Workable, SmartRecruiters, Recruitee, Personio, Pinpoint.
// Each lists one company's own board, so offers link to the employer's form, not an aggregator.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { decodeEntities, htmlToText } from "./html";
import { getJson, getText, prettySlug } from "./http";

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
