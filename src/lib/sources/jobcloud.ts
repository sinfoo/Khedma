// jobs.ch and jobup.ch (Switzerland, same JobCloud engine). Their /api/ is disallowed by robots.txt, but the
// public search page embeds a schema.org ItemList of JobPosting entries, and the detail page a full JobPosting.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { htmlToText, pickJsonLdJobPosting } from "./html";
import { getText, sleep } from "./http";

const SITES = {
  jobsch: { base: "https://www.jobs.ch", path: "/en/vacancies/" },
  jobup: { base: "https://www.jobup.ch", path: "/en/jobs/" },
} as const;
export type JobCloudSite = keyof typeof SITES;

export function jobcloudSearchUrl(site: JobCloudSite, term: string, location = ""): string {
  const p = new URLSearchParams();
  if (location) p.set("location", location);
  p.set("term", term);
  return `${SITES[site].base}${SITES[site].path}?${p}`;
}

interface LdPosting {
  title?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string;
  url?: string;
  hiringOrganization?: { name?: string };
  jobLocation?: { address?: { addressLocality?: string; addressCountry?: string } } | { address?: { addressLocality?: string; addressCountry?: string } }[];
}

function toJob(it: LdPosting, site: JobCloudSite): NewJob | null {
  if (!it.title || !it.url) return null;
  const title = it.title.trim();
  const loc = Array.isArray(it.jobLocation) ? it.jobLocation[0] : it.jobLocation;
  const location = [loc?.address?.addressLocality, loc?.address?.addressCountry === "CH" ? "Switzerland" : loc?.address?.addressCountry].filter(Boolean).join(", ");
  const description = htmlToText(it.description ?? "");
  // The listing's description is boilerplate ("We are looking for X to join our team."); keep the contract only.
  const body = /to join our team\.?$/i.test(description) ? "" : description;
  return {
    title,
    company: it.hiringOrganization?.name?.trim() || (site === "jobsch" ? "jobs.ch" : "jobup.ch"),
    location,
    remote: guessRemote(`${title} ${body.slice(0, 400)}`),
    url: it.url,
    source: site as SourceKind,
    type: guessType(`${title} ${it.employmentType ?? ""}`, body),
    description: [it.employmentType && `Contract: ${it.employmentType}`, body].filter(Boolean).join("\n\n"),
    tags: extractTags(title, body),
    posted_at: normalizeDate(it.datePosted),
    deadline: normalizeDate(it.validThrough),
  };
}

/** Search page HTML -> offers from its JSON-LD ItemList. */
export function parseJobcloudSearch(html: string, site: JobCloudSite): NewJob[] {
  const out: NewJob[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const blocks = Array.isArray(data) ? data : [data];
    for (const b of blocks as { "@type"?: string; itemListElement?: { item?: LdPosting & { "@type"?: string } }[] }[]) {
      if (b?.["@type"] !== "ItemList") continue;
      for (const li of b.itemListElement ?? []) {
        if (li.item?.["@type"] !== "JobPosting") continue;
        const j = toJob(li.item, site);
        if (j) out.push(j);
      }
    }
  }
  return out;
}

/** Detail page HTML -> full description (JSON-LD JobPosting). */
export function parseJobcloudDetail(html: string): Partial<NewJob> | null {
  const ld = pickJsonLdJobPosting(html) as LdPosting | null;
  if (!ld?.description) return null;
  const description = htmlToText(ld.description);
  return description.length > 40 ? { description, deadline: normalizeDate(ld.validThrough) } : null;
}

export function make(site: JobCloudSite) {
  return {
    async list(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
      const terms = keywords.length ? keywords.slice(0, 3) : ["internship"];
      const jobs: NewJob[] = [];
      let error: string | undefined;
      for (const kw of terms) {
        const { text, error: e } = await getText(jobcloudSearchUrl(site, kw, handle.trim()), "text/html", { timeoutMs: 15_000 });
        if (e) {
          error = e;
          continue;
        }
        jobs.push(...parseJobcloudSearch(text, site));
        await sleep(800);
      }
      return { jobs, error: jobs.length ? undefined : error };
    },
    async detail(job: NewJob): Promise<Partial<NewJob> | null> {
      const { text, error } = await getText(job.url, "text/html", { timeoutMs: 15_000 });
      if (error) return null;
      const d = parseJobcloudDetail(text);
      if (!d) return null;
      const contract = job.description.split("\n")[0];
      return { ...d, description: [contract.startsWith("Contract:") ? contract : "", d.description].filter(Boolean).join("\n\n") };
    },
  };
}
