// IamExpat (iamexpat.nl / .de / .ch): English-language jobs for internationals, one engine for three countries.
// Server-rendered category lists (/career/jobs-<country>/<category>?page=N, 20 cards a page) give title, employer
// (logo alt text), place, category and posted date. robots.txt asks Crawl-delay: 1 and disallows /job/ and /search/,
// not /career/. Posting pages have no structured data and weigh ~2.5 MB, so the listing is all Khedma reads.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType } from "./classify";
import { decodeEntities } from "./html";
import { getText, sleep } from "./http";
import { parseLongDate } from "./jobbank";

const SITES = {
  nl: { base: "https://www.iamexpat.nl/career/jobs-netherlands", country: "Netherlands" },
  de: { base: "https://www.iamexpat.de/career/jobs-germany", country: "Germany" },
  ch: { base: "https://www.iamexpat.ch/career/jobs-switzerland", country: "Switzerland" },
} as const;
export type IamExpatSite = keyof typeof SITES;
const isSite = (s: string): s is IamExpatSite => s in SITES;

/** The board's tech categories; the planner's keywords are matched later, the board itself has no keyword search. */
const CATEGORIES = ["it-technology-positions", "engineering-positions"];

export const iamexpatUrl = (site: IamExpatSite, category: string, page = 1) => `${SITES[site].base}/${category}${page > 1 ? `?page=${page}` : ""}`;

const clean = (s: string) => decodeEntities(s.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function parseIamExpat(html: string, site: IamExpatSite): NewJob[] {
  const { base, country } = SITES[site];
  const origin = new URL(base).origin;
  const out: NewJob[] = [];
  for (const m of html.matchAll(/<a href="([^"]+)" class="JobBoardItemCard_cardWrapper__[\w-]+"[^>]*>([\s\S]*?)<\/a>/g)) {
    const c = m[2];
    const title = clean(/title-7 line-clamp-3 break-words">([\s\S]*?)<\/span>/.exec(c)?.[1] ?? "");
    if (!title) continue;
    const company = decodeEntities(/<img alt="([^"]*)"/.exec(c)?.[1] ?? "").trim();
    const category = clean(/body-small uppercase">([\s\S]*?)<\/div>/.exec(c)?.[1] ?? "");
    const info = [...c.matchAll(/JobBoardItemCard_jobInfoElement__[\w-]+">([\s\S]*?)<\/div>/g)].map((x) => clean(x[1]));
    const posted = info.find((i) => /^Posted date/i.test(i))?.replace(/^Posted date\s*/i, "") ?? "";
    const city = info.find((i) => !/^Posted date/i.test(i)) ?? "";
    out.push({
      title,
      company: company || "IamExpat",
      location: city && city !== country ? `${city}, ${country}` : country,
      remote: guessRemote(`${title} ${city}`),
      url: new URL(m[1], origin).toString(),
      source: "iamexpat" as SourceKind,
      type: guessType(title),
      description: category ? `Category: ${category}` : "",
      tags: extractTags(title),
      posted_at: posted ? parseLongDate(posted) : null,
      deadline: null,
    });
  }
  return out;
}

/** Handle = comma list of sites ("nl,de"); empty = the Netherlands. */
export async function scan(handle: string): Promise<{ jobs: NewJob[]; error?: string }> {
  const sites = handle.split(",").map((s) => s.trim().toLowerCase()).filter(isSite);
  const seen = new Map<string, NewJob>();
  let error: string | undefined;
  for (const site of sites.length ? [...new Set(sites)] : (["nl"] as IamExpatSite[])) {
    // ponytail: 2 pages of IT jobs and 1 of engineering per country (≈60 cards); widen if students miss offers.
    for (const [category, pages] of [[CATEGORIES[0], 2], [CATEGORIES[1], 1]] as const) {
      for (let page = 1; page <= pages; page++) {
        const { text, error: e } = await getText(iamexpatUrl(site, category, page), "text/html", { timeoutMs: 20_000 });
        await sleep(1000); // robots.txt Crawl-delay: 1
        if (e) {
          error = e;
          break;
        }
        const jobs = parseIamExpat(text, site);
        for (const j of jobs) if (!seen.has(j.url)) seen.set(j.url, j);
        if (jobs.length < 20) break;
      }
    }
  }
  return { jobs: [...seen.values()], error: seen.size ? undefined : error };
}
