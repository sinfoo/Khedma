// Wantedly (Japan): public JSON endpoint behind the project search page. robots.txt does not block /api/.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, normalizeDate } from "./classify";
import { getJson } from "./http";

interface WantedlyProject {
  id?: number;
  title?: string;
  published_at?: string;
  location?: string;
  description?: string;
  looking_for?: string;
  company?: { name?: string };
}
export interface WantedlyPayload {
  data?: WantedlyProject[];
  _metadata?: { total_pages?: number };
}

export const wantedlyUrl = (q: string, page = 1) => `https://www.wantedly.com/api/v1/projects?${new URLSearchParams({ q, page: String(page) })}`;

export function mapWantedly(json: WantedlyPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const p of json.data ?? []) {
    if (!p.id || !p.title) continue;
    const title = p.title.trim();
    const description = (p.description ?? "").trim();
    // Addresses are Japanese prefecture strings; the suffix keeps the country filter working.
    const location = p.location?.trim() ? `${p.location.trim()}, Japan` : "Japan";
    out.push({
      title,
      company: p.company?.name?.trim() || "Wantedly",
      location,
      remote: guessRemote(`${title} ${description.slice(0, 400)}`),
      url: `https://www.wantedly.com/projects/${p.id}`,
      source: "wantedly" as SourceKind,
      type: guessType(`${title} ${p.looking_for ?? ""}`, description),
      description: [p.looking_for && `Role: ${p.looking_for}`, description].filter(Boolean).join("\n\n"),
      tags: extractTags(title, description),
      posted_at: normalizeDate(p.published_at),
      deadline: null,
    });
  }
  return out;
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const terms = keywords.length ? keywords.slice(0, 3) : ["intern"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const { data, error: e } = await getJson<WantedlyPayload>(wantedlyUrl(kw));
    if (!data) {
      error = e;
      continue;
    }
    jobs.push(...mapWantedly(data));
  }
  return { jobs, error: jobs.length ? undefined : error };
}
