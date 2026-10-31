// No Fluff Jobs (Polish IT board, salary always shown): server-rendered category lists filtered to trainee/junior,
// JobPosting JSON-LD on each /pl/job/ page. robots.txt (checked 2026-10-25) disallows /api/ and /posting/: never called.
// The same lists run for Hungary (/hu): the handle is a comma list of codes ("pl,hu"), empty = Poland. The /sk list
// is left out: on 2026-10-31 it held the Polish offers (14 of 15 in Poland), not Slovak ones.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { ldDetail } from "./ats-more";
import { extractTags, guessRemote, guessType, matchesKeywords } from "./classify";
import { htmlToText } from "./html";
import { getText, sleep } from "./http";
import { inPoland } from "./justjoin";

const BASE = "https://nofluffjobs.com";
const HTML = "text/html, application/xhtml+xml;q=0.9, */*;q=0.5";

/** Keyword -> the board's category path (/pl/<category>). */
const CATEGORY: [RegExp, string][] = [
  [/\bfull-?stack\b/, "fullstack"], [/\bjavascript\b|\btypescript\b|\breact\b|\bangular\b|\bvue\b|\bfront-?end\b/, "frontend"],
  [/\bandroid\b|\bios\b|\bflutter\b|\bmobile\b|\bswift\b/, "mobile"], [/\btest(er|ing)?\b|\bqa\b/, "testing"],
  [/\bdevops\b|\bcloud\b|\bkubernetes\b|\bdocker\b|\bsre\b/, "devops"], [/\bai\b|\bml\b|\bmachine learning\b|\bdeep learning\b|\bllm\b/, "artificial-intelligence"],
  [/\bdata\b|\bsql\b|\betl\b|\bbi\b/, "data"], [/\bembedded\b|\bc\+\+|\biot\b|\bfirmware\b/, "embedded"], [/\bsecurity\b|\bcyber/, "security"],
  [/\bjava\b|\bpython\b|\bphp\b|\.net\b|\bc#|\bgo(lang)?\b|\bruby\b|\bscala\b|\bnode\b|\bback-?end\b|\bspring\b|\bkotlin\b/, "backend"],
];
export const nofluffCategory = (keyword: string) => CATEGORY.find(([re]) => re.test(keyword.toLowerCase()))?.[1] ?? "";

/** Markets by ISO code: their country and the word their cards use for remote work. */
const MARKETS: Record<string, { country: string; remote: RegExp }> = {
  pl: { country: "Poland", remote: /^zdalnie$/i },
  hu: { country: "Hungary", remote: /^távmunka$/i },
};
const marketOf = (url: string) => /nofluffjobs\.com\/(hu)\//.exec(url)?.[1] ?? "pl";
/** "Budapest" -> "Budapest, Hungary"; Polish places ("Katowice, PL") stay in Poland. */
const placeIn = (place = "", market = "pl") => {
  if (market === "pl" || /, PL$/i.test(place)) return inPoland(place);
  const parts = place.split(", ").filter((p) => p && !/^[A-Z]{2}$/.test(p));
  return [...parts, MARKETS[market].country].join(", ");
};

/** page=2 answers with the first two pages (40 offers) in one response. */
export const nofluffUrl = (category = "", market = "pl") => `${BASE}/${market}${category ? `/${category}` : ""}?criteria=seniority%3Dtrainee,junior&page=2`;

const text = (s?: string) => htmlToText(s ?? "").replace(/\s+/g, " ").trim();

export function parseNofluffList(html: string, market = "pl"): NewJob[] {
  const out: NewJob[] = [];
  for (const card of html.split(new RegExp(`<a\\b[^>]*\\bhref="(?=\\/${market}\\/job\\/)`)).slice(1)) {
    const path = new RegExp(`^(\\/${market}\\/job\\/[a-z0-9-]+)"`).exec(card)?.[1];
    const title = text(/data-cy="title position on the job offer listing"[^>]*>([\s\S]*?)<\/h3>/.exec(card)?.[1]);
    if (!path || !title) continue;
    const company = text(/commonicon="job_offer"[\s\S]*?<span class="tw-truncate">([\s\S]*?)<\/span>/.exec(card)?.[1]);
    const place = text(/data-cy="location on the job offer listing"[^>]*>([\s\S]*?)<\/span>/.exec(card)?.[1]).replace(/\s*\+\d+$/, "");
    const remote = MARKETS[market].remote.test(place) || guessRemote(title);
    const contract = text(/data-cy="contract type on the job offer listing"[^>]*>([\s\S]*?)<\/span>/.exec(card)?.[1]);
    const salary = text(/data-cy="salary ranges on the job offer listing"[^>]*>([\s\S]*?)<\/span>/.exec(card)?.[1]);
    const skills = [...card.matchAll(/data-cy="category name on the job offer listing"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => text(m[1]));
    const description = [salary && `Salary: ${salary}${contract ? ` (${contract})` : ""}`, skills.length && `Skills: ${skills.join(", ")}`].filter(Boolean).join("\n");
    out.push({
      title, company: company || "No Fluff Jobs", location: remote ? MARKETS[market].country : placeIn(place, market), remote,
      url: `${BASE}${path}`, source: "nofluff" as SourceKind, type: guessType(title, description), description,
      tags: extractTags(title, skills.join(" ")), posted_at: null, deadline: null,
    });
  }
  return out;
}

export async function scan(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const chosen = handle.split(",").map((c) => c.trim().toLowerCase()).filter((c) => c in MARKETS);
  const markets = chosen.length ? chosen : ["pl"];
  // Category ("" = every trainee/junior IT offer) -> title words that filter it (none for a category list).
  const lists = new Map<string, string[]>(keywords.length ? [] : [["", []]]);
  for (const kw of keywords.slice(0, 3)) {
    const cat = nofluffCategory(kw);
    lists.set(cat, cat ? [] : [...(lists.get(cat) ?? []), ...kw.split(/\s+/).filter((w) => w.length >= 4)]);
  }
  const seen = new Map<string, NewJob>();
  let error: string | undefined;
  let first = true;
  for (const market of markets) {
    for (const [cat, words] of lists) {
      if (!first) await sleep(500);
      first = false;
      const { text: html, error: e } = await getText(nofluffUrl(cat, market), HTML, { timeoutMs: 20_000 });
      if (e) {
        error = e;
        continue;
      }
      for (const j of parseNofluffList(html, market)) if (!seen.has(j.url) && matchesKeywords(j.title, words)) seen.set(j.url, j);
    }
  }
  return { jobs: [...seen.values()], error: seen.size ? undefined : error };
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const d = await ldDetail(job);
  // The listing's salary and skills line stays on top of the full text.
  return d && { ...d, title: d.title?.trim(), remote: job.remote || d.remote, location: job.remote ? job.location : placeIn(d.location, marketOf(job.url)), description: [job.description, d.description].filter(Boolean).join("\n\n") };
}
