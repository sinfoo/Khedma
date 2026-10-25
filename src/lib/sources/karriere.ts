// karriere.at: Austria's main job board. Server-rendered search at /jobs/<keyword-slug>[/<city>] (15 cards: title,
// employer, places, date, pills such as Praktika / Homeoffice / salary, and a short summary); robots.txt allows
// everything for other user agents. Posting pages (/jobs/<id>) carry JobPosting JSON-LD.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType } from "./classify";
import { decodeEntities } from "./html";
import { getText, sleep } from "./http";

const slug = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const karriereUrl = (keywords: string, city = "") => `https://www.karriere.at/jobs/${slug(keywords) || "praktikum"}${slug(city) ? `/${slug(city)}` : ""}`;

const clean = (s: string) => decodeEntities(s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** "7.10.2026" -> "2026-10-07"; "vor 4 Tagen veröffentlicht", "heute", "gestern" counted back from `now`. */
export function karriereDate(s: string, now = new Date()): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const days = /\bheute\b/i.test(s) ? 0 : /\bgestern\b/i.test(s) ? 1 : Number(/vor (\d+) Tag/i.exec(s)?.[1] ?? NaN);
  return Number.isFinite(days) ? new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10) : null;
}

export function parseKarriere(html: string, now = new Date()): NewJob[] {
  const out: NewJob[] = [];
  for (const c of html.split(/class="m-jobsListItem /).slice(1)) {
    const link = /class="m-jobsListItem__titleLink" href="(https:\/\/www\.karriere\.at\/jobs\/\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(c);
    if (!link) continue;
    const title = clean(link[2]);
    const company = clean(/class="m-jobsListItem__companyName[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span)>/.exec(c)?.[1] ?? "");
    const cities = [...c.matchAll(/class="m-jobsListItem__location"[^>]*>([\s\S]*?)<span class="m-jobsListItem__location--lastComma"/g)].map((m) => clean(m[1]));
    const pills = [...c.matchAll(/<span class="m-jobsListItem__pill">([\s\S]*?)<\/span>/g)].map((m) => clean(m[1])).filter(Boolean);
    const summary = clean(/class="m-jobListSummary__text[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(c)?.[1] ?? "");
    const date = clean(/class="m-jobsListItem__date"[^>]*>([\s\S]*?)<\/span>/.exec(c)?.[1] ?? "");
    out.push({
      title,
      company: company || "karriere.at",
      location: cities.length ? `${cities.slice(0, 3).join(" · ")}, Austria` : "Austria",
      remote: guessRemote(title) || pills.some((p) => /^remote|^100\s*%\s*homeoffice/i.test(p)),
      url: link[1],
      source: "karriere" as SourceKind,
      type: guessType(`${title} ${pills.some((p) => /^praktik/i.test(p)) ? "praktikum" : ""}`, summary),
      description: [pills.length && pills.join(" · "), summary].filter(Boolean).join("\n\n"),
      tags: extractTags(title, summary),
      posted_at: karriereDate(date, now),
      deadline: null,
    });
  }
  return out;
}

/** Handle = optional city ("wien", "graz"); empty = all of Austria. */
export async function scan(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const seen = new Map<string, NewJob>();
  let error: string | undefined;
  for (const kw of (keywords.length ? keywords : ["praktikum software"]).slice(0, 3)) {
    const { text, error: e } = await getText(karriereUrl(kw, handle), "text/html", { timeoutMs: 20_000 });
    if (e) error = e;
    else for (const j of parseKarriere(text)) if (!seen.has(j.url)) seen.set(j.url, j);
    await sleep(1000);
  }
  return { jobs: [...seen.values()], error: seen.size ? undefined : error };
}
