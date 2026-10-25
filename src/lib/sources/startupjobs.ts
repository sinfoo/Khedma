// StartupJobs.cz (Czech startup jobs): its offers sitemap lists every live offer, each page carries JobPosting JSON-LD.
// robots.txt (checked 2026-10-25): Allow: / (only /admin/ and /superadmin/ are closed).
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { ldDetail, parseSitemap } from "./ats-more";
import { extractTags, guessType, matchesKeywords } from "./classify";
import { getText } from "./http";

export const STARTUPJOBS_SITEMAP = "https://www.startupjobs.cz/sitemap/offers.xml";
// ponytail: the sitemap gives slugs only, so a scan keeps the 30 newest matches (detail pages fill 20 of them).
const MAX = 30;

/** Sitemap URLs -> slug-titled offers, newest (highest id) first. */
export function parseStartupjobsSitemap(xml: string): NewJob[] {
  return parseSitemap(xml).urls
    .map((u) => ({ url: u.loc, m: /\/nabidka\/(\d+)\/([^/?#]+)/.exec(u.loc) }))
    .filter((x): x is { url: string; m: RegExpExecArray } => !!x.m)
    .sort((a, b) => Number(b.m[1]) - Number(a.m[1]))
    .map(({ url, m }) => {
      const t = m[2].replace(/-+/g, " ").trim();
      const title = t.charAt(0).toUpperCase() + t.slice(1);
      return {
        title, company: "StartupJobs.cz", location: "Czechia", remote: /\bremote\b/.test(t), url, source: "startupjobs" as SourceKind,
        type: guessType(title), description: "", tags: extractTags(title), posted_at: null, deadline: null,
      };
    });
}

/** "Praha, Hlavní město Praha, Česko" -> "Praha, Hlavní město Praha, Czechia". */
const inCzechia = (loc = "") => {
  const parts = loc.split(", ").filter((p) => p && !/^(CZ|CZE|Česko|Česká republika|Czech Republic|Czechia)$/i.test(p));
  return parts.length ? `${parts.join(", ")}, Czechia` : "Czechia";
};

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const { text, error } = await getText(STARTUPJOBS_SITEMAP, "application/xml, text/xml;q=0.9", { timeoutMs: 20_000 });
  if (error) return { jobs: [], error };
  const words = (keywords.length ? keywords.slice(0, 3) : ["junior", "intern"]).flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 3);
  // Czech slugs say "staz" / "stazista" for an internship.
  if (words.some((w) => /^(intern|stage|stagiaire|praktikum)/i.test(w))) words.push("staz");
  return { jobs: parseStartupjobsSitemap(text).filter((j) => matchesKeywords(j.title, words)).slice(0, MAX) };
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const d = await ldDetail(job);
  return d && { ...d, remote: job.remote || d.remote, location: inCzechia(d.location) };
}
