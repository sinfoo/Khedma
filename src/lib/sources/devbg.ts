// DEV.BG, Bulgaria's IT job board (WordPress + WP Job Manager): the public WP REST search of its job listings
// (/wp-json/wp/v2/job-listings?search=, checked 2026-10-31). robots.txt only bars JoobleBot. City, seniority and
// tech stack come as class names ("job_listings_tag-plovdiv", "seniority-intern"); the employer starts the slug.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessType, matchesKeywords, normalizeDate } from "./classify";
import { htmlToText } from "./html";
import { getJson, prettySlug } from "./http";

interface DevbgJob { link?: string; slug?: string; date?: string; title?: { rendered?: string }; content?: { rendered?: string }; class_list?: string[] }

export const devbgUrl = (search: string) =>
  `https://dev.bg/wp-json/wp/v2/job-listings?${new URLSearchParams({ per_page: "50", _fields: "link,slug,date,title,content,class_list", ...(search.trim() && { search: search.trim() }) })}`;

const slugify = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const CITY: Record<string, string> = { sofiya: "Sofia", "veliko-tarnovo": "Veliko Tarnovo", "stara-zagora": "Stara Zagora" };

/** "Ict Strypes" from the slug "ict-strypes-junior-python-developer-1" and its title; "" when the title is not in it (Cyrillic titles). */
export function devbgCompany(slug: string, title: string): string {
  const t = slugify(title);
  const at = t ? slug.indexOf(`-${t}`) : -1;
  return at > 0 ? prettySlug(slug.slice(0, at)) : "";
}

export function mapDevbg(json: DevbgJob[]): NewJob[] {
  // One offer is posted once per city: merge them into one offer listing every city.
  const byKey = new Map<string, NewJob & { cities: string[] }>();
  for (const j of json) {
    const title = htmlToText(j.title?.rendered ?? "").trim();
    if (!title || !j.link) continue;
    const classes = j.class_list ?? [];
    const of = (prefix: string) => classes.filter((c) => c.startsWith(prefix)).map((c) => c.slice(prefix.length));
    const cities = of("job_listings_tag-").filter((c) => c !== "remote").map((c) => CITY[c] ?? prettySlug(c));
    const company = devbgCompany(j.slug ?? "", title) || "DEV.BG";
    const remote = classes.includes("job_listings_tag-remote");
    const key = `${company}|${title}`;
    const seen = byKey.get(key);
    if (seen) {
      seen.cities.push(...cities.filter((c) => !seen.cities.includes(c)));
      seen.remote ||= remote;
      continue;
    }
    const description = htmlToText(j.content?.rendered ?? "");
    const stack = of("techstack-").join(" ");
    byKey.set(key, {
      title, company, location: "", cities: [...cities], remote,
      url: j.link, source: "devbg" as SourceKind,
      type: guessType(`${title} ${of("seniority-").includes("intern") ? "internship" : ""}`, description),
      description, tags: extractTags(title, `${description} ${stack}`), posted_at: normalizeDate(j.date), deadline: null,
    });
  }
  return [...byKey.values()].map(({ cities, ...j }) => ({ ...j, location: [cities.join(" · "), "Bulgaria"].filter(Boolean).join(", ") }));
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const terms = keywords.length ? keywords.slice(0, 3) : [""];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const { data, error: e } = await getJson<DevbgJob[]>(devbgUrl(kw));
    if (Array.isArray(data)) jobs.push(...mapDevbg(data));
    else error = e ?? `Unexpected answer from ${devbgUrl(kw)}`;
  }
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  return { jobs: jobs.filter((j) => matchesKeywords(j.title, words)), error: jobs.length ? undefined : error };
}
