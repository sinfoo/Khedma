import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessTypeWithContract, matchesKeywords, normalizeDate } from "./classify";
import { htmlToText, pickJsonLdJobPosting } from "./html";
import { getText, sleep } from "./http";

// Tanitjobs listing pages (/jobs/ or /categories/<id>/<slug>/). robots.txt disallows
// keyword search URLs (`/*keyword`), so we read the newest listing pages and filter
// by keyword locally. Detail pages carry a schema.org JobPosting.

const ORIGIN = "https://www.tanitjobs.com";
const PAGES = 2;
const SOURCE = "tanitjobs" as SourceKind;

/** "" -> /jobs/, "705/informatique-jobs" or a full category URL -> that category. */
export function tanitListUrl(handle: string, page = 1): string {
  const h = handle.trim().replace(/^https?:\/\/www\.tanitjobs\.com/i, "").replace(/^\/+|\/+$/g, "").replace(/^categories\//, "");
  const path = /^\d+\/[\p{L}\w-]+$/u.test(h) ? `/categories/${h}/` : "/jobs/";
  return `${ORIGIN}${path}${page > 1 ? `?page=${page}` : ""}`;
}

const text = (html: string | undefined) => (html ? htmlToText(html).replace(/\s+/g, " ").trim() : "");

export function parseTanitList(html: string): (NewJob & { contract: string })[] {
  const out: (NewJob & { contract: string })[] = [];
  for (const card of html.split(/<div class="sj-job-card\b/).slice(1)) {
    const url = /href="(https:\/\/www\.tanitjobs\.com\/job\/\d+\/[^"]*)"/.exec(card)?.[1];
    const title = text(/class="sj-card-title"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/.exec(card)?.[1]);
    if (!url || !title) continue;
    const companyBlock = /class="sj-card-company"[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1] ?? "";
    const company = text(/<a[^>]*>([\s\S]*?)<\/a>/.exec(companyBlock)?.[1]);
    const location = text(/class="sj-card-tag sj-loc"[^>]*>([\s\S]*?)<\/span>/.exec(card)?.[1]) || text(companyBlock.split(/class="sj-sep"[^>]*>[\s\S]*?<\/span>/)[1]);
    const contract = [...card.matchAll(/class="sj-card-tag sj-type"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => text(m[1])).join(", ");
    const snippet = text(/class="sj-card-desc"[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1]);
    const d = /class="sj-card-date"[^>]*>\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(card);
    out.push({
      title,
      company: company || "Tanitjobs",
      location: location.replace(/,?\s*Tunisie$/, ""),
      remote: guessRemote(`${title} ${location}`),
      url: encodeURI(decodeURI(url)),
      source: SOURCE,
      type: guessTypeWithContract(title, contract, snippet),
      description: [contract && `Contrat : ${contract}`, snippet].filter(Boolean).join("\n\n"),
      tags: extractTags(title, snippet),
      posted_at: d ? `${d[3]}-${d[2]}-${d[1]}` : null,
      deadline: null,
      contract,
    });
  }
  return out;
}

export function parseTanitDetail(html: string): Partial<NewJob> | null {
  const ld = pickJsonLdJobPosting(html);
  if (!ld) return null;
  const description = htmlToText(String(ld.description ?? "")).slice(0, 12_000);
  return {
    ...(description ? { description } : {}),
    posted_at: normalizeDate(String(ld.datePosted ?? "")),
    deadline: normalizeDate(String(ld.validThrough ?? "")),
  };
}

export async function scan(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const seen = new Map<string, NewJob & { contract: string }>();
  let error: string | undefined;
  for (let page = 1; page <= PAGES; page++) {
    if (page > 1) await sleep(800);
    const res = await getText(tanitListUrl(handle, page), "text/html");
    if (res.error) {
      error = res.error;
      break;
    }
    const jobs = parseTanitList(res.text);
    if (!jobs.length) {
      if (page === 1) error = "Tanitjobs page format changed: no offers found";
      break;
    }
    for (const j of jobs) seen.set(j.url, j);
  }
  const jobs = [...seen.values()].filter((j) => matchesKeywords(`${j.title} ${j.contract} ${j.description}`, keywords));
  return { jobs, error: jobs.length || seen.size ? undefined : error };
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const { text: html, error } = await getText(job.url, "text/html");
  if (error) return null;
  const d = parseTanitDetail(html);
  if (!d) return null;
  const contract = /^Contrat : .+$/m.exec(job.description)?.[0];
  return { ...d, description: [contract, d.description].filter(Boolean).join("\n\n") };
}
