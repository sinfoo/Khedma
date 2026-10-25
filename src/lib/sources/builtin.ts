// Built In (US tech jobs): category/level listing paths such as /jobs/dev-engineering/entry-level.
// robots.txt allows these paths and /jobs*?page=, but disallows /jobs*?search=, so keywords only filter locally.
// Posting pages (/job/<slug>/<id>) carry a JobPosting in JSON-LD, written with an escaped type="application/ld&#x2B;json".
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, matchesKeywords } from "./classify";
import { decodeEntities, pickJsonLdJobPosting } from "./html";
import { getText } from "./http";
import { fromJsonLd } from "./url";

const BASE = "https://builtin.com";
export const BUILTIN_PATHS = ["dev-engineering/entry-level", "internship", "data-analytics/entry-level", "design-ux/entry-level"];

/** Handle = listing path ("" = entry-level software engineering). Never a ?search= query. */
export function builtinUrl(path = "", page = 1): string {
  const p = BUILTIN_PATHS.includes(path) ? path : BUILTIN_PATHS[0];
  return `${BASE}/jobs/${p}${page > 1 ? `?page=${page}` : ""}`;
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function parseBuiltinList(html: string): NewJob[] {
  const out: NewJob[] = [];
  for (const c of html.split(/data-id="job-card"/).slice(1)) {
    const a = /<a href="(\/job\/[^"]+\/\d+)"[^>]*data-id="job-card-title"[^>]*>([\s\S]*?)<\/a>/.exec(c);
    const title = clean(a?.[2] ?? "");
    if (!a || !title) continue;
    // Icon-labelled attributes: <i class="fa-regular fa-location-dot …"></i> … <span class="font-barlow text-gray-04">Austin, TX, USA</span>
    const attr = (icon: string) => clean(new RegExp(`fa-${icon}\\b[\\s\\S]*?<span class="font-barlow text-gray-04">([\\s\\S]*?)</span>`).exec(c)?.[1] ?? "");
    const place = attr("location-dot");
    const mode = attr("house-building");
    const salary = attr("sack-dollar");
    const level = attr("trophy");
    const snippet = clean(/<div class="fs-sm fw-regular mb-md text-gray-04">([\s\S]*?)<\/div>/.exec(c)?.[1] ?? "");
    const skills = [...(/Top Skills:([\s\S]*?)<\/div>/.exec(c)?.[1] ?? "").matchAll(/<span class="fs-xs text-gray-04 mx-sm">([^<]*)<\/span>/g)].map((m) => clean(m[1]));
    const description = [
      [mode, level, salary && `Salary: ${salary}`].filter(Boolean).join(" · "),
      skills.length ? `Top skills: ${skills.join(", ")}` : "",
      snippet,
    ].filter(Boolean).join("\n\n");
    const location = !place ? "United States" : /\b(USA|United States)\b/.test(place) ? place : `${place}, United States`;
    out.push({
      title,
      company: clean(/data-id="company-title"[^>]*>([\s\S]*?)<\/a>/.exec(c)?.[1] ?? "") || "Built In",
      location,
      remote: /^remote$/i.test(mode) || guessRemote(place),
      url: `${BASE}${a[1]}`,
      source: "builtin" as SourceKind,
      type: guessType(title, snippet),
      description,
      tags: extractTags(`${title} ${skills.join(" ")}`, snippet),
      posted_at: null,
      deadline: null,
    });
  }
  return out;
}

export async function scan(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (let page = 1; page <= 2; page++) {
    const { text, error: e } = await getText(builtinUrl(handle.trim(), page), "text/html", { timeoutMs: 20_000 });
    if (e) {
      error = e;
      break;
    }
    const got = parseBuiltinList(text);
    jobs.push(...got);
    if (got.length < 20) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  return { jobs: jobs.filter((j) => matchesKeywords(`${j.title} ${j.description}`, words)), error: jobs.length ? undefined : error };
}

export function parseBuiltinDetail(html: string, url: string): Partial<NewJob> | null {
  const ld = pickJsonLdJobPosting(html.replace(/application\/ld&#x2B;json/gi, "application/ld+json"));
  if (!ld) return null;
  const { description, posted_at, deadline } = fromJsonLd(ld, url);
  return description ? { description, posted_at, deadline } : null;
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const { text, error } = await getText(job.url, "text/html", { timeoutMs: 20_000 });
  const d = error ? null : parseBuiltinDetail(text, job.url);
  return d ? { ...d, description: [job.description.split("\n\n")[0], d.description].filter(Boolean).join("\n\n") } : null;
}
