// Landing.jobs (Portugal and European tech, many offers with relocation): the /jobs?query= page its own search box uses
// is server-rendered cards; offer pages (/at/<company>/<slug>) carry JobPosting JSON-LD.
// robots.txt (checked 2026-10-25) disallows /api/ and /jobs/search: neither is called.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { countryByCode } from "../geo";
import { ldDetail } from "./ats-more";
import { extractTags, guessType } from "./classify";
import { htmlToText } from "./html";
import { getText } from "./http";

const BASE = "https://landing.jobs";
const HTML = "text/html, application/xhtml+xml;q=0.9, */*;q=0.5";

export const landingjobsUrl = (query = "") => `${BASE}/jobs${query.trim() ? `?${new URLSearchParams({ query: query.trim() })}` : ""}`;

const text = (s?: string) => htmlToText(s ?? "").replace(/\s+/g, " ").trim();

/** "Lisbon, PT" / "Lisbon, Lisbon, PT" -> "Lisbon, Portugal". */
export function withCountryName(loc: string): string {
  const parts = loc.split(/\s*,\s*/).filter(Boolean);
  const last = parts.at(-1) ?? "";
  if (/^[A-Z]{2}$/.test(last)) parts[parts.length - 1] = countryByCode(last)?.en ?? last;
  return [...new Set(parts)].join(", ");
}

export function parseLandingjobsList(html: string): NewJob[] {
  const out: NewJob[] = [];
  for (const card of html.split(/<article class="lj-jobcard-static">/).slice(1)) {
    const link = /class="lj-jobcard-static__link" href="(\/at\/[^"/]+\/[^"/?#]+)"[^>]*>([\s\S]*?)<\/a>/.exec(card);
    if (!link) continue;
    const title = text(link[2]);
    const field = (name: string) => text(new RegExp(`class="lj-jobcard-static__${name}[^"]*"[^>]*>([\\s\\S]*?)</(?:span|div)>`).exec(card)?.[1]);
    const mode = field("badge");
    const contract = field("contract");
    const salary = field("salary");
    const skills = [...card.matchAll(/class="lj-jobcard-static__skill"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => text(m[1]));
    const description = [mode && `Work mode: ${mode}`, contract && `Contract: ${contract}`, salary && `Salary: ${salary}`, skills.length && `Skills: ${skills.join(", ")}`]
      .filter(Boolean).join("\n");
    out.push({
      title, company: field("company") || "Landing.jobs", location: withCountryName(field("location")), remote: /^remote/i.test(mode),
      url: `${BASE}${link[1]}`, source: "landingjobs" as SourceKind, type: guessType(`${title} ${contract}`, description), description,
      tags: extractTags(title, skills.join(" ")), posted_at: null, deadline: null,
    });
  }
  return out;
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const seen = new Map<string, NewJob>();
  let error: string | undefined;
  for (const kw of keywords.length ? keywords.slice(0, 3) : [""]) { // no keyword: the 50 newest offers
    const { text: html, error: e } = await getText(landingjobsUrl(kw), HTML, { timeoutMs: 20_000 });
    if (e) {
      error = e;
      continue;
    }
    for (const j of parseLandingjobsList(html)) if (!seen.has(j.url)) seen.set(j.url, j);
  }
  return { jobs: [...seen.values()], error: seen.size ? undefined : error };
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const d = await ldDetail(job);
  // The card's work mode, contract, salary and skills stay on top of the full text.
  return d && { ...d, remote: job.remote || d.remote, location: withCountryName(d.location ?? "") || job.location, description: [job.description, d.description].filter(Boolean).join("\n\n") };
}
