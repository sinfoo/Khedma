// Shared fetch wrapper: 10s timeout, app User-Agent, one retry on a busy answer, a short cache inside scans. Never throws.
import { AsyncLocalStorage } from "node:async_hooks";
import { lookup } from "node:dns/promises";

/** The running scan's Stop signal. Every fetch and pause made inside `scanSignal.run(signal, …)` honours it. */
export const scanSignal = new AsyncLocalStorage<AbortSignal | undefined>();

export const USER_AGENT = "Khedma/0.2 (+https://github.com/sinfoo/Khedma)";

/**
 * Inside `scanCache.run({ hits: 0, misses: 0 }, …)` (one source of a scan), GET answers are kept in memory: for
 * CACHE_FRESH_MS they are served without a request, then for CACHE_KEEP_MS they are revalidated with the server's
 * ETag / Last-Modified (a 304 costs the board nothing). Errors are never kept. Liveness checks and URL imports
 * run outside a scope and always hit the network.
 */
export const scanCache = new AsyncLocalStorage<{ hits: number; misses: number }>();
export const CACHE_FRESH_MS = 10 * 60_000;
const CACHE_KEEP_MS = 6 * 3_600_000;
// ponytail: bounded by total characters, oldest first; move it to the kv table if scans must stay warm across restarts.
const CACHE_MAX_CHARS = 16_000_000;
interface Cached {
  text: string;
  at: number;
  etag?: string;
  modified?: string;
}
// On globalThis so dev reloads of this module keep it (same as the scan state).
const cache = ((globalThis as { __khedmaHttpCache?: Map<string, Cached> }).__khedmaHttpCache ??= new Map<string, Cached>());

/** Forget every kept answer (tests; a scan that must re-read every board). */
export const clearScanCache = () => cache.clear();

function remember(key: string, entry: Cached): void {
  cache.delete(key);
  if (entry.text.length > CACHE_MAX_CHARS / 4) return;
  cache.set(key, entry);
  let size = 0;
  for (const [k, v] of cache) {
    if (entry.at - v.at > CACHE_KEEP_MS) cache.delete(k);
    else size += v.text.length;
  }
  for (const [k, v] of cache) {
    if (size <= CACHE_MAX_CHARS) break;
    cache.delete(k);
    size -= v.text.length;
  }
}

/** Statuses worth one more try: the board is busy or restarting, not refusing. */
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const RETRY_MAX_WAIT_MS = 5000;

/** How long a 429/503 asks to wait (Retry-After in seconds or as a date), 1 s when it does not say. */
export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return 1000;
  const s = Number(header);
  const ms = Number.isFinite(s) ? s * 1000 : new Date(header).getTime() - now;
  return Number.isFinite(ms) ? Math.max(0, ms) : 1000;
}

export async function getText(
  url: string,
  accept = "application/json, text/*;q=0.9, */*;q=0.8",
  opts: { ua?: string; timeoutMs?: number; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {},
): Promise<{ text: string; error?: string }> {
  const stop = opts.signal ?? scanSignal.getStore();
  const scope = opts.body === undefined ? scanCache.getStore() : undefined;
  const key = scope ? [url, accept, opts.ua ?? "", JSON.stringify(opts.headers ?? {})].join("\n") : "";
  const hit = scope ? cache.get(key) : undefined;
  if (hit && Date.now() - hit.at < CACHE_FRESH_MS) {
    scope!.hits++;
    return { text: hit.text };
  }
  // One more try after a busy answer or a dropped connection; a timeout or a Stop is final.
  for (let attempt = 0; ; attempt++) {
    try {
      if (stop?.aborted) return { text: "", error: `Stopped for ${url}` };
      const timeout = AbortSignal.timeout(opts.timeoutMs ?? 10_000);
      const { res } = await publicFetch(url, {
        method: opts.body === undefined ? "GET" : "POST",
        headers: {
          "User-Agent": opts.ua ?? USER_AGENT,
          Accept: accept,
          ...(opts.body !== undefined && { "Content-Type": "application/json" }),
          ...(hit?.etag && { "If-None-Match": hit.etag }),
          ...(hit?.modified && { "If-Modified-Since": hit.modified }),
          ...opts.headers,
        },
        body: opts.body,
        signal: stop ? AbortSignal.any([timeout, stop]) : timeout,
      });
      if (res.status === 304 && hit) {
        remember(key, { ...hit, at: Date.now() });
        scope!.hits++;
        return { text: hit.text };
      }
      // Any other answer means the board was really asked, whatever it said.
      if (scope) scope.misses++;
      if (RETRY_STATUS.has(res.status) && attempt === 0) {
        const wait = retryAfterMs(res.headers.get("retry-after"));
        if (wait <= RETRY_MAX_WAIT_MS) {
          await sleep(wait, stop);
          continue;
        }
      }
      if (!res.ok) return { text: "", error: `HTTP ${res.status} for ${url}` };
      const text = await decodeBody(res);
      if (scope) remember(key, { text, at: Date.now(), etag: res.headers.get("etag") ?? undefined, modified: res.headers.get("last-modified") ?? undefined });
      return { text };
    } catch (e) {
      const name = (e as Error).name;
      if (attempt === 0 && name !== "TimeoutError" && name !== "AbortError" && !stop?.aborted && !/^(Invalid URL|Only http|Private or local|Too many redirects)/.test((e as Error).message)) {
        await sleep(500, stop);
        continue;
      }
      if (scope) scope.misses++;
      return { text: "", error: `${name === "TimeoutError" ? "Timeout" : name === "AbortError" ? "Stopped" : "Network error"} for ${url}: ${(e as Error).message}` };
    }
  }
}

/** Body text in the charset the server declares (ISO-8859-1 feeds would otherwise come out garbled). */
export async function decodeBody(res: Response): Promise<string> {
  const charset = /charset=["']?([\w-]+)/i.exec(res.headers.get("content-type") ?? "")?.[1];
  const buf = await res.arrayBuffer();
  try {
    return new TextDecoder(charset ?? "utf-8").decode(buf);
  } catch {
    return new TextDecoder().decode(buf); // unknown charset label
  }
}

/** Loopback, private, link-local, CGNAT and reserved hosts, by name or IP literal. */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168);
  }
  if (h.includes(":")) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h)?.[1];
    if (mapped) return isPrivateHost(mapped);
    return h === "::" || h === "::1" || h.startsWith("::ffff:") || /^fe[89ab]/.test(h) || /^f[cd]/.test(h);
  }
  return !h.includes("."); // single-label names resolve on the local network
}

/** Why `raw` may not be fetched, or null: not http(s), a private host, or a name that resolves to one. */
export async function publicUrlError(raw: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "Invalid URL";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Only http(s) URLs are allowed";
  if (isPrivateHost(u.hostname)) return "Private or local hosts are not allowed";
  try {
    const addrs = await lookup(u.hostname.replace(/^\[|\]$/g, ""), { all: true });
    if (addrs.some((a) => isPrivateHost(a.address))) return "Private or local hosts are not allowed";
  } catch {
    // unresolvable: fetch fails on its own with a clearer error
  }
  return null;
}

/**
 * fetch that checks every hop: the URL, the addresses its name resolves to, and each redirect target.
 * ponytail: fetch resolves the name again, so a rebinding DNS server could still switch addresses between the two
 * lookups; pin the checked address with an undici dispatcher if Khedma ever runs as a shared server.
 */
export async function publicFetch(url: string, init: RequestInit, maxHops = 5): Promise<{ res: Response; url: string }> {
  for (let hop = 0; ; hop++) {
    const bad = await publicUrlError(url);
    if (bad) throw new Error(bad);
    const res = await fetch(url, { ...init, redirect: "manual" });
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!loc) return { res, url };
    if (hop >= maxHops) throw new Error("Too many redirects");
    url = new URL(loc, url).toString();
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && init.method === "POST")) init = { ...init, method: "GET", body: undefined };
  }
}

export async function getJson<T>(url: string, opts: { headers?: Record<string, string>; body?: string; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<{ data?: T; error?: string }> {
  const { text, error } = await getText(url, "application/json", opts);
  if (error) return { error };
  try {
    return { data: JSON.parse(text) as T };
  } catch {
    return { error: `Invalid JSON from ${url}` };
  }
}

/** "acme-corp_eu" -> "Acme Corp Eu" */
export function prettySlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Pause between polite requests; a stopped scan ends the pause at once. */
export const sleep = (ms: number, stop: AbortSignal | undefined = scanSignal.getStore()) =>
  new Promise<void>((resolve) => {
    if (stop?.aborted) return resolve();
    // The listener leaves with the timer: a scan makes hundreds of pauses on one signal.
    const onStop = () => (clearTimeout(t), resolve());
    const t = setTimeout(() => (stop?.removeEventListener("abort", onStop), resolve()), ms);
    stop?.addEventListener("abort", onStop, { once: true });
  });

/** Run `fn` over items with at most `limit` in flight, waiting `gapMs` before each start. Order is kept. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>, gapMs = 0): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      if (gapMs) await sleep(gapMs);
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Khedma has no login, so it answers only to this machine: any Host other than localhost is a request from the
 * network (campus Wi-Fi) or from a DNS-rebinding page whose own name now points at 127.0.0.1.
 */
export function isLoopbackHost(host: string | null): boolean {
  const name = /^(\[[^\]]+\]|[^:]+)(:\d+)?$/.exec((host ?? "").toLowerCase())?.[1];
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

/**
 * Local route handlers have no auth, so refuse cross-site requests: a page on another
 * origin must not be able to trigger scans or overwrite the database from the browser.
 */
export function isSameOrigin(req: Request): boolean {
  if (!isLoopbackHost(req.headers.get("host"))) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
