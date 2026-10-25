// Just Join IT (Poland's main IT board): the server-rendered list carries an ItemList JSON-LD (url + title) and each
// offer page a JobPosting JSON-LD. robots.txt (checked 2026-10-25) disallows /api/ and /oferty-pracy/*,*: never called.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { ldDetail } from "./ats-more";
import { extractTags, guessType, matchesKeywords } from "./classify";
import { decodeEntities } from "./html";
import { getText, prettySlug } from "./http";

const BASE = "https://justjoin.it";
const HTML = "text/html, application/xhtml+xml;q=0.9, */*;q=0.5";

/** Keyword word -> the board's category slug (its /job-offers/all-locations/<slug> lists). */
const TECH: [RegExp, string][] = [
  [/\bjava\b(?!script)|\bspring\b|\bkotlin\b/, "java"], [/\bpython\b|\bdjango\b/, "python"],
  [/\bjavascript\b|\btypescript\b|\breact\b|\bangular\b|\bvue\b|\bnode\b|\bfront-?end\b/, "javascript"],
  [/\bphp\b|\blaravel\b|\bsymfony\b/, "php"], [/\.net\b|\bc#|\bdotnet\b/, "net"], [/\bc\+\+|\bembedded\b/, "c"],
  [/\bgo(lang)?\b/, "go"], [/\bruby\b/, "ruby"], [/\bscala\b/, "scala"], [/\bandroid\b|\bios\b|\bflutter\b|\bmobile\b|\bswift\b/, "mobile"],
  [/\bdevops\b|\bcloud\b|\bkubernetes\b|\bdocker\b|\bsre\b/, "devops"], [/\bdata\b|\bsql\b|\betl\b/, "data"],
  [/\bai\b|\bml\b|\bmachine learning\b|\bdeep learning\b|\bllm\b/, "ai"], [/\btest(er|ing)?\b|\bqa\b/, "testing"],
  [/\bsecurity\b|\bcyber/, "security"], [/\bux\b|\bui\b|\bdesign(er)?\b/, "ux"], [/\bgame\b|\bunity\b/, "game"],
];
export const justjoinTech = (keyword: string) => TECH.find(([re]) => re.test(keyword.toLowerCase()))?.[1] ?? "";

export const justjoinUrl = (tech = "") => `${BASE}/job-offers/all-locations${tech ? `/${tech}` : ""}?experience-levels=junior`;

const slugify = (s: string) => s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "allegro-junior-java-developer-krakow-java-1a2b3c4d" + title -> company and city slugs around the title. */
export function splitOfferSlug(url: string, title: string): { company: string; city: string } {
  const slug = (url.split("/job-offer/")[1] ?? "").replace(/-+/g, "-");
  const t = slugify(title);
  const i = t ? slug.indexOf(`-${t}-`) : -1;
  if (i <= 0) return { company: "", city: "" };
  const rest = slug.slice(i + t.length + 2).replace(/-[0-9a-f]{8}$/, "").split("-");
  rest.pop(); // the category slug
  return { company: prettySlug(slug.slice(0, i)), city: prettySlug(rest.join("-")) };
}

/** Offers of a list page, from its ItemList JSON-LD (title and URL; company and city read from the URL until the detail). */
export function parseJustjoinList(html: string): NewJob[] {
  const out: NewJob[] = [];
  for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let items: { url?: string; name?: string }[] = [];
    try {
      items = JSON.parse(m[1])?.mainEntity?.itemListElement ?? [];
    } catch {
      continue;
    }
    for (const it of items) {
      if (!it.url?.startsWith(`${BASE}/job-offer/`) || !it.name) continue;
      const title = decodeEntities(it.name).trim();
      const { company, city } = splitOfferSlug(it.url, title);
      out.push({
        title, company: company || "Just Join IT", location: city ? `${city}, Poland` : "Poland", remote: false,
        url: it.url, source: "justjoin" as SourceKind, type: guessType(title), description: "", tags: extractTags(title),
        posted_at: null, deadline: null,
      });
    }
  }
  return out;
}

/** "Kraków, PL" -> "Kraków, Poland". */
export const inPoland = (loc = "") => {
  const parts = loc.split(", ").filter((p) => p && !/^(PL|POL|Polska|Poland)$/i.test(p));
  return parts.length ? `${parts.join(", ")}, Poland` : "Poland";
};

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  // Category slug ("" = every junior offer) -> title words that filter it (none for a category list).
  const lists = new Map<string, string[]>(keywords.length ? [] : [["", []]]);
  for (const kw of keywords.slice(0, 3)) {
    const tech = justjoinTech(kw);
    lists.set(tech, tech ? [] : [...(lists.get(tech) ?? []), ...kw.split(/\s+/).filter((w) => w.length >= 4)]);
  }
  const seen = new Map<string, NewJob>();
  let error: string | undefined;
  for (const [tech, words] of lists) {
    const { text, error: e } = await getText(justjoinUrl(tech), HTML, { timeoutMs: 20_000 });
    if (e) {
      error = e;
      continue;
    }
    for (const j of parseJustjoinList(text)) if (!seen.has(j.url) && matchesKeywords(j.title, words)) seen.set(j.url, j);
  }
  return { jobs: [...seen.values()], error: seen.size ? undefined : error };
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const d = await ldDetail(job);
  return d && { ...d, location: inPoland(d.location) };
}
