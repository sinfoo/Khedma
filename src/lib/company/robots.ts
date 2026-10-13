// Polite page fetch: public hosts only, robots.txt honoured (cached per origin), 10s timeout, bounded body.
import { USER_AGENT } from "../sources/http";
import { validatePublicUrl } from "../sources/url";

interface Rule {
  allow: boolean;
  path: string;
}
interface Robots {
  rules: Rule[];
  at: number;
}

const TTL = 60 * 60 * 1000;
const MAX_BODY = 400_000;
const OUR_TOKEN = USER_AGENT.split("/")[0].toLowerCase();

declare global {
  var __khedmaRobots: Map<string, Robots> | undefined;
}
const cache = (globalThis.__khedmaRobots ??= new Map<string, Robots>());

/** Rules that apply to us: our own user-agent group if present, else "*". */
export function parseRobots(txt: string): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (cur && (key === "allow" || key === "disallow")) cur.rules.push({ allow: key === "allow", path: val });
  }
  const mine = groups.find((g) => g.agents.some((a) => a.includes(OUR_TOKEN)));
  const star = groups.filter((g) => g.agents.includes("*")).flatMap((g) => g.rules);
  return mine ? mine.rules : star;
}

const toRe = (p: string) =>
  new RegExp("^" + p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*").replace(/\\\$$/, "$"));

/** Longest matching rule wins (allow beats disallow on equal length); no rule = allowed. */
export function robotsAllow(rules: Rule[], pathname: string): boolean {
  let best: { len: number; allow: boolean } | null = null;
  for (const r of rules) {
    if (!r.path) continue;
    if (!toRe(r.path).test(pathname)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}

async function rulesFor(u: URL): Promise<Rule[]> {
  const hit = cache.get(u.origin);
  if (hit && Date.now() - hit.at < TTL) return hit.rules;
  let rules: Rule[] = [];
  try {
    const res = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(6_000), redirect: "follow" });
    if (res.ok) rules = parseRobots((await res.text()).slice(0, 200_000));
  } catch {
    // unreachable robots.txt = no restrictions, same as the crawling convention
  }
  cache.set(u.origin, { rules, at: Date.now() });
  return rules;
}

export interface Fetched {
  status: number; // 0 = network/timeout
  html: string;
  finalUrl: string;
  error?: string;
  blocked?: boolean; // robots.txt disallow or private host
}

export async function politeFetch(raw: string): Promise<Fetched> {
  const { url, error } = validatePublicUrl(raw);
  if (!url) return { status: 0, html: "", finalUrl: raw, error, blocked: true };
  if (!robotsAllow(await rulesFor(url), url.pathname + url.search)) return { status: 0, html: "", finalUrl: url.toString(), error: "Disallowed by robots.txt", blocked: true };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html, application/xhtml+xml;q=0.9, */*;q=0.5", "Accept-Language": "fr, en;q=0.8" },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    const html = (await res.text()).slice(0, MAX_BODY);
    return { status: res.status, html, finalUrl: res.url || url.toString() };
  } catch (e) {
    return { status: 0, html: "", finalUrl: url.toString(), error: (e as Error).name === "TimeoutError" ? "Timeout" : `Network error: ${(e as Error).message}` };
  }
}
