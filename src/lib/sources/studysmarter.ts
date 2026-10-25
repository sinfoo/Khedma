// StudySmarter Talents (talents.studysmarter.de): German internships, working-student and entry jobs.
// Its job list is WP Job Manager: GET /jm-ajax/get_listings/ answers {found_jobs, max_num_pages, html} with the cards
// (title, company, place, contract, pay). robots.txt allows it (only /wp/, /wp-json/, /feed/… are disallowed).
// Posting pages carry JobPosting JSON-LD.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType } from "./classify";
import { decodeEntities } from "./html";
import { getJson, sleep } from "./http";

export const studysmarterUrl = (keywords: string, page = 1) =>
  `https://talents.studysmarter.de/jm-ajax/get_listings/?${new URLSearchParams({ search_keywords: keywords, per_page: "50", page: String(page) })}`;

export interface StudySmarterPayload { found_jobs?: boolean; max_num_pages?: number; html?: string }

const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function parseStudySmarter(html: string, now = new Date()): NewJob[] {
  const out: NewJob[] = [];
  for (const c of html.split(/<div class="c-job-card"/).slice(1)) {
    const url = /href="(https:\/\/talents\.studysmarter\.de\/companies\/[^"]+)"/.exec(c)?.[1];
    const title = clean(/class="c-job-card__title[^"]*"[^>]*>([\s\S]*?)<\/h4>/.exec(c)?.[1] ?? "");
    if (!url || !title) continue;
    const company = clean(/class="c-job-card__company-name"[^>]*>([\s\S]*?)<\/p>/.exec(c)?.[1] ?? "");
    const pins = [...c.matchAll(/<p class="c-job-card__pin-list"([^>]*)>([\s\S]*?)<\/p>/g)];
    const place = pins.find((p) => p[1].includes("location-root"));
    const cities = place ? [...place[2].matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => clean(m[1])).filter(Boolean) : [];
    const rest = pins.filter((p) => p !== place).map((p) => clean(p[2])).filter(Boolean);
    const pay = rest.find((p) => /€|eur\b/i.test(p));
    const contract = rest.filter((p) => p !== pay).join(", ");
    const days = Number(/data-publish-days="(\d+)"/.exec(c)?.[1]);
    const posted = Number.isFinite(days) ? new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10) : null;
    const location = cities.length ? `${cities.slice(0, 3).join(" · ")}, Germany` : "Germany";
    out.push({
      title,
      company: company || "StudySmarter",
      location,
      remote: guessRemote(`${title} ${cities.join(" ")}`),
      url,
      source: "studysmarter" as SourceKind,
      type: guessType(`${title} ${contract}`),
      description: [contract && `Contract: ${contract}`, pay && `Pay: ${pay}`].filter(Boolean).join("\n"),
      tags: extractTags(title),
      posted_at: posted,
      deadline: null,
    });
  }
  return out;
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const seen = new Map<string, NewJob>();
  let error: string | undefined;
  // ponytail: first page (50 cards) of the first 3 keywords; the board sorts newest first.
  for (const kw of (keywords.length ? keywords : ["informatik"]).slice(0, 3)) {
    const { data, error: e } = await getJson<StudySmarterPayload>(studysmarterUrl(kw));
    if (e) error = e;
    for (const j of parseStudySmarter(data?.html ?? "")) if (!seen.has(j.url)) seen.set(j.url, j);
    await sleep(1000);
  }
  return { jobs: [...seen.values()], error: seen.size ? undefined : error };
}
