import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessTypeWithContract } from "./classify";
import { htmlToText } from "./html";
import { getText, sleep } from "./http";

// Emploitunisie.com keyword search (/recherche-jobs-tunisie/<keyword>). robots.txt asks
// for a 10 s crawl delay, so we space keyword queries 10 s apart, cap them at 3 and do
// not fetch detail pages: the listing already carries a long excerpt, contract, region
// and date.

const ORIGIN = "https://www.emploitunisie.com";
const SOURCE = "emploitunisie" as SourceKind;
const CRAWL_DELAY = 10_000;
export const MAX_QUERIES = 3;

export const emploitunisieSearchUrl = (keyword: string) =>
  `${ORIGIN}/recherche-jobs-tunisie${keyword.trim() ? `/${encodeURIComponent(keyword.trim().toLowerCase())}` : ""}`;

const text = (html: string | undefined) => (html ? htmlToText(html).replace(/\s+/g, " ").trim() : "");

export function parseEmploitunisieList(html: string): NewJob[] {
  const out: NewJob[] = [];
  for (const card of html.split(/<div class="card card-job"/).slice(1)) {
    const href = /data-href="([^"]+)"/.exec(card)?.[1] ?? /<h3>\s*<a href="([^"]+)"/.exec(card)?.[1];
    const rawTitle = text(/<h3>\s*<a[^>]*>([\s\S]*?)<\/a>/.exec(card)?.[1]);
    if (!href || !rawTitle) continue;
    const company = text(/class="card-job-company[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(card)?.[1]);
    const snippet = text(/class="card-job-description"[^>]*>\s*<p>([\s\S]*?)<\/p>/.exec(card)?.[1]);
    const li = (label: RegExp) => {
      for (const m of card.matchAll(/<li>([\s\S]*?)<\/li>/g)) if (label.test(text(m[1]))) return text(/<strong>([\s\S]*?)<\/strong>/.exec(m[1])?.[1]);
      return "";
    };
    const contract = li(/Contrat propos/i);
    const region = li(/R[ée]gion/i);
    const level = li(/Niveau d.?[ée]tudes/i);
    const exp = li(/exp[ée]rience/i);
    // "Stagiaire Assistant Chef de Projet - Tunis" -> title + city suffix.
    const sep = /^(.*\S)\s+-\s+([^-]{2,60})$/.exec(rawTitle);
    const title = sep ? sep[1] : rawTitle;
    const location = sep ? sep[2] : region;
    const description = [
      contract && `Contrat : ${contract}`,
      level && `Niveau d'études : ${level}`,
      exp && `Expérience : ${exp}`,
      snippet,
    ]
      .filter(Boolean)
      .join("\n");
    out.push({
      title,
      company: company || "Emploitunisie",
      location: location || region,
      remote: guessRemote(`${title} ${snippet.slice(0, 300)}`),
      url: new URL(href, ORIGIN).toString(),
      source: SOURCE,
      type: guessTypeWithContract(title, contract, snippet),
      description,
      tags: extractTags(title, snippet),
      posted_at: /<time datetime="(\d{4}-\d{2}-\d{2})/.exec(card)?.[1] ?? null,
      deadline: null,
    });
  }
  return out;
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const queries = keywords.length ? [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_QUERIES) : [""];
  const byUrl = new Map<string, NewJob>();
  const errors: string[] = [];
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await sleep(CRAWL_DELAY);
    const { text: html, error } = await getText(emploitunisieSearchUrl(queries[i]), "text/html");
    if (error) {
      errors.push(error);
      continue;
    }
    for (const j of parseEmploitunisieList(html)) byUrl.set(j.url, j);
  }
  return { jobs: [...byUrl.values()], error: byUrl.size ? undefined : errors[0] };
}
