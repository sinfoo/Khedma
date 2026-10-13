import type { NewJob } from "../db";
import type { Profile, Source } from "../types";
import { extractTags, guessType, matchesProfile } from "./classify";
import { mapLimit } from "./http";
import * as greenhouse from "./greenhouse";
import * as lever from "./lever";
import * as ashby from "./ashby";
import * as rss from "./rss";
import * as keejob from "./keejob";
import * as tanitjobs from "./tanitjobs";
import * as emploitunisie from "./emploitunisie";
import * as farojob from "./farojob";
import * as linkedin from "./linkedin";
import * as arbeitnow from "./arbeitnow";
import * as jobroom from "./jobroom";
import * as wantedly from "./wantedly";
import * as daijob from "./daijob";
import * as jobbank from "./jobbank";
import * as jobcloud from "./jobcloud";
import * as englishjobs from "./englishjobs";
import * as remote from "./remote";
import * as keyed from "./keyed";
import { countryByCode, fitsPlaces, REMOTE_CODE } from "../geo";

export { importFromUrl } from "./url";
export { DEMO_JOBS } from "./demo";
export { guessType, extractTags, matchesProfile, matchesKeywords, dedupeKey } from "./classify";
export { CATALOG, PROVIDER_KINDS, LINK_KINDS, isProviderKind, platformLinks, placeCodes, type ProviderKind, type LinkKind, type CatalogEntry, type CatalogCountry } from "./catalog";
import { CATALOG, type ProviderKind } from "./catalog";

/** Public boards verified live on 2026-10-07 (all returned 200 with postings). */
export const SUGGESTED_SOURCES: Pick<Source, "kind" | "label" | "handle">[] = [
  { kind: "greenhouse", label: "Vercel", handle: "vercel" },
  { kind: "greenhouse", label: "GitLab", handle: "gitlab" },
  { kind: "greenhouse", label: "Doctolib", handle: "doctolib" },
  { kind: "lever", label: "Qonto", handle: "qonto" },
  { kind: "ashby", label: "Supabase", handle: "supabase" },
  { kind: "ashby", label: "Replit", handle: "replit" },
  { kind: "rss", label: "We Work Remotely – Programming", handle: "https://weworkremotely.com/categories/remote-programming-jobs.rss" },
  { kind: "rss", label: "Python.org Jobs", handle: "https://www.python.org/jobs/feed/rss/" },
];

/** Tunisian boards verified live on 2026-10-13 (robots.txt checked, real postings returned). */
export const SUGGESTED_TN_SOURCES: { kind: ProviderKind; label: string; handle: string }[] = [
  { kind: "keejob", label: "Keejob", handle: "" },
  { kind: "tanitjobs", label: "Tanitjobs – Informatique", handle: "705/informatique-jobs" },
  { kind: "emploitunisie", label: "Emploitunisie", handle: "" },
  { kind: "farojob", label: "Farojob – Informatique", handle: "informatique" },
];

type ListFn = (handle: string, keywords: string[]) => Promise<{ jobs: NewJob[]; error?: string }>;
interface Provider {
  list: ListFn;
  /** Optional detail fetch for offers the listing only summarizes. */
  detail?: (job: NewJob) => Promise<Partial<NewJob> | null>;
  /** Pause between detail fetches (sequential) when the site's robots.txt asks for a crawl delay. */
  detailGapMs?: number;
}

const PROVIDERS: Record<ProviderKind, Provider> = {
  greenhouse: { list: (h) => greenhouse.scan(h) },
  lever: { list: (h) => lever.scan(h) },
  ashby: { list: (h) => ashby.scan(h) },
  rss: { list: (h) => rss.scan(h) },
  keejob: { list: keejob.scan, detail: keejob.detail },
  tanitjobs: { list: tanitjobs.scan, detail: tanitjobs.detail },
  emploitunisie: { list: emploitunisie.scan },
  farojob: { list: farojob.scan, detail: farojob.detail },
  linkedin: { list: linkedin.scan, detail: linkedin.detail },
  arbeitnow: { list: arbeitnow.scan },
  englishjobs_de: { list: englishjobs.make("englishjobs_de") },
  englishjobs_fr: { list: englishjobs.make("englishjobs_fr") },
  englishjobs_ch: { list: englishjobs.make("englishjobs_ch") },
  jobsch: jobcloud.make("jobsch"),
  jobup: jobcloud.make("jobup"),
  jobroom: { list: jobroom.scan, detail: jobroom.detail },
  jobbank: { list: jobbank.scan, detail: jobbank.detail, detailGapMs: 5000 },
  daijob: { list: daijob.scan },
  wantedly: { list: wantedly.scan },
  remoteok: { list: remote.scan.remoteok },
  jobicy: { list: remote.scan.jobicy },
  himalayas: { list: remote.scan.himalayas },
  remotive: { list: remote.scan.remotive },
  aijobs: { list: remote.scan.aijobs },
  adzuna: { list: keyed.scan.adzuna },
  jooble: { list: keyed.scan.jooble },
  reed: { list: keyed.scan.reed },
  findwork: { list: keyed.scan.findwork },
};

export interface ScanOptions {
  /** Search keywords for boards that support them. Empty = provider default listing. */
  keywords?: string[];
  /** Skip the profile filter and keep every listed offer. */
  keepAll?: boolean;
  /** Already-stored offers: they are skipped before any detail page is fetched. */
  isKnown?: (job: NewJob) => boolean;
  /** Detail pages fetched per scan (politeness cap). */
  maxDetails?: number;
  /** Where the user wants to apply; offers in other countries are dropped (unknown locations pass). */
  places?: { countries: string[]; remote: "yes" | "only" | "no" };
}

export interface ScanResult {
  jobs: NewJob[];
  /** Raw listing count before filtering. */
  total: number;
  /** Offers that passed the profile filter (before skipping known ones). */
  matched: number;
  /** Matched offers already in the database (same URL or same company + title). */
  known: number;
  error?: string;
}

/** Scan one source: list, dedupe by url, filter by profile, skip known offers, enrich with detail pages. */
export async function scanSource(source: { kind: string; handle: string }, profile: Profile, opts: ScanOptions = {}): Promise<ScanResult> {
  const provider = PROVIDERS[source.kind as ProviderKind];
  if (!provider) return { jobs: [], total: 0, matched: 0, known: 0, error: `Unknown source kind: ${source.kind}` };
  // A board tied to one country is not worth a request when the user applies elsewhere.
  const chosen = (opts.places?.countries ?? []).filter((c) => c !== REMOTE_CODE);
  const home = CATALOG.find((c) => c.kind === source.kind)?.country;
  if (chosen.length && home && home !== "INT" && !chosen.includes(home)) return { jobs: [], total: 0, matched: 0, known: 0 };
  let listed: { jobs: NewJob[]; error?: string };
  if (source.kind === "linkedin" && !source.handle.trim() && opts.places?.countries.length) {
    // No explicit location: search each chosen country (two at most, politeness).
    const names = opts.places.countries.map((c) => countryByCode(c)?.search).filter((x): x is string => !!x).slice(0, 2);
    const parts = await Promise.all((names.length ? names : ["Tunisia"]).map((n) => provider.list(n, opts.keywords ?? [])));
    listed = { jobs: parts.flatMap((p) => p.jobs), error: parts.find((p) => p.error && !p.jobs.length)?.error };
  } else listed = await provider.list(source.handle, opts.keywords ?? []);
  const { jobs, error } = listed;
  const seen = new Set<string>();
  const keep = (j: NewJob) => opts.keepAll || (matchesProfile(j, profile) && (!opts.places || fitsPlaces(j, opts.places)));
  const matched = jobs.filter((j) => {
    if (seen.has(j.url) || !keep(j)) return false;
    seen.add(j.url);
    return true;
  });
  const fresh = opts.isKnown ? matched.filter((j) => !opts.isKnown!(j)) : matched;

  let out = fresh;
  if (provider.detail && fresh.length) {
    const cap = opts.maxDetails ?? 20;
    // ponytail: detail pages are fetched 3 at a time with a 400 ms gap; raise only if boards allow it.
    const enriched = await mapLimit(fresh.slice(0, cap), provider.detailGapMs ? 1 : 3, async (j) => {
      const d = await provider.detail!(j).catch(() => null);
      if (!d) return j;
      const n = { ...j, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== undefined && v !== "")) } as NewJob;
      // Reclassify with the full text; keep a listing-level internship type if the body is vague.
      const t = guessType(n.title, n.description);
      return { ...n, type: t === "emploi" ? j.type : t, tags: extractTags(n.title, n.description) };
    }, provider.detailGapMs ?? 400);
    out = [...enriched, ...fresh.slice(cap)].filter(keep);
  }
  return { jobs: out, total: jobs.length, matched: matched.length, known: matched.length - fresh.length, error };
}
