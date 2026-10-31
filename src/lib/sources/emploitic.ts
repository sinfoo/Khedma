// Emploitic, Algeria's main job board: its keyword search page (/offres-d-emploi/q-<keyword>) carries a schema.org
// SearchResultsPage whose items are full JobPostings (title, employer, place, date, contract). robots.txt (checked
// 2026-10-31) allows every agent outside /partenaires/. Posting pages carry the full JobPosting for the detail fetch.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { matchesKeywords } from "./classify";
import { getText } from "./http";
import { fromJsonLd } from "./url";

const BASE = "https://emploitic.com/offres-d-emploi";
const HTML = "text/html, application/xhtml+xml;q=0.9, */*;q=0.5";
const slug = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const emploiticUrl = (keyword: string) => (slug(keyword) ? `${BASE}/q-${slug(keyword)}` : BASE);

type Json = Record<string, unknown>;

export function parseEmploiticList(html: string): NewJob[] {
  const out: NewJob[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let page: Json;
    try {
      page = JSON.parse(m[1]) as Json;
    } catch {
      continue;
    }
    const items = ((page.mainEntity as Json | undefined)?.itemListElement ?? []) as { url?: string; item?: Json }[];
    for (const { url, item } of items) {
      if (!url || !item || item["@type"] !== "JobPosting") continue;
      const j = fromJsonLd(item, url);
      if (!j.title) continue;
      // Places end in the ISO code ("El Biar, Alger, DZ"): name the country so the location filter knows it.
      out.push({ ...j, url, company: j.company || "Emploitic", location: j.location.replace(/(^|, )DZ$/, "$1Algeria") || "Algeria", source: "emploitic" as SourceKind });
    }
  }
  return out;
}

/** First results page (10 offers) per keyword; no keyword reads the newest offers. */
export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const terms = keywords.length ? keywords.slice(0, 3) : [""];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const { text, error: e } = await getText(emploiticUrl(kw), HTML);
    if (text) jobs.push(...parseEmploiticList(text));
    else error = e;
  }
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  return { jobs: jobs.filter((j) => matchesKeywords(j.title, words)), error: jobs.length ? undefined : error };
}
