// get in IT (get-in-it.de): German entry-level and graduate IT board. The search page is server-rendered Next.js;
// its offers sit in __NEXT_DATA__ (jobSearchJobs.jobs, the newest 39 per topic). There is no keyword search, only
// topics (thematicPriority ids), so keywords pick the topics. robots.txt only disallows the /jobsuche/feeds/ exports.
// Detail pages carry JobPosting JSON-LD.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType } from "./classify";
import { getText, sleep } from "./http";

const BASE = "https://www.get-in-it.de";

/** Topic ids of the board's own filter, picked by keyword. */
export const GETINIT_TOPICS: [RegExp, number, string][] = [
  [/web|front|back|full.?stack|javascript|react|php/i, 5, "Webentwicklung"],
  [/data|daten|\bbi\b|analy|machine|\bml\b|\bai\b|\bki\b/i, 39, "Datenbankentwicklung/BI"],
  [/embedded|iot|firmware|elektron|electron|hardware|mechatron/i, 45, "Embedded Systems"],
  [/secur|sicherheit|cyber/i, 51, "IT-Security"],
  [/devops|cloud|admin|system|network|netzwerk|reseau|réseau|linux/i, 35, "System Engineering / Admin"],
  [/\bqa\b|test|quality/i, 24, "Quality Assurance"],
  [/\bux\b|\bui\b|design/i, 47, "UX/UI"],
  [/consult|berat/i, 37, "Consulting"],
  [/d[ée]v|software|logiciel|entwickl|program|engineer|ing[ée]nieur|informati/i, 36, "Anwendungsentwicklung"],
];

/** Up to 3 topic ids for these keywords; software development when none fits. */
export function getinitTopics(keywords: string[]): number[] {
  const ids = new Set<number>();
  for (const k of keywords) for (const [re, id] of GETINIT_TOPICS) if (re.test(k)) ids.add(id);
  return [...(ids.size ? ids : [36])].slice(0, 3);
}

export const getinitUrl = (topic?: number) => `${BASE}/jobsuche${topic ? `?thematicPriority=${topic}` : ""}`;

interface GiJob { id?: number; title?: string; url?: string; homeOffice?: boolean; locations?: { name?: string }[]; company?: { title?: string }; careers?: { name?: string }[] }

export function parseGetinit(html: string): NewJob[] {
  const raw = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!raw) return [];
  let jobs: GiJob[] = [];
  try {
    jobs = JSON.parse(raw)?.props?.initialState?.jobSearchJobs?.jobs ?? [];
  } catch {
    return [];
  }
  const out: NewJob[] = [];
  for (const j of jobs) {
    if (!j.title || !j.url) continue;
    const title = j.title.trim();
    const cities = (j.locations ?? []).map((l) => l.name?.trim()).filter(Boolean);
    const topics = (j.careers ?? []).map((c) => c.name).filter(Boolean).join(", ");
    const description = [topics && `Topics: ${topics}`, j.homeOffice && "Home office possible"].filter(Boolean).join("\n");
    out.push({
      title,
      company: j.company?.title?.trim() || "get in IT",
      location: cities.length ? `${cities.slice(0, 3).join(" · ")}, Germany` : "Germany",
      remote: guessRemote(title),
      url: new URL(j.url, BASE).toString(),
      source: "getinit" as SourceKind,
      type: guessType(title),
      description,
      tags: extractTags(title, topics),
      posted_at: null,
      deadline: null,
    });
  }
  return out;
}

/** Handle = optional topic id (from the catalog select); empty = topics picked from the keywords. */
export async function scan(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const topics = Number(handle) ? [Number(handle)] : getinitTopics(keywords);
  const seen = new Map<string, NewJob>();
  let error: string | undefined;
  for (const t of topics) {
    const { text, error: e } = await getText(getinitUrl(t), "text/html", { timeoutMs: 20_000 });
    if (e) error = e;
    else for (const j of parseGetinit(text)) if (!seen.has(j.url)) seen.set(j.url, j);
    await sleep(1000);
  }
  return { jobs: [...seen.values()], error: seen.size ? undefined : error };
}
