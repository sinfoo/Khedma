// Shared fetch wrapper: 10s timeout, app User-Agent, never throws.

export const USER_AGENT = "ENITJobs/0.1 (+https://github.com/sinfoo/ENITJobs)";

export async function getText(
  url: string,
  accept = "application/json, text/*;q=0.9, */*;q=0.8",
): Promise<{ text: string; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!res.ok) return { text: "", error: `HTTP ${res.status} for ${url}` };
    return { text: await res.text() };
  } catch (e) {
    return { text: "", error: `${(e as Error).name === "TimeoutError" ? "Timeout" : "Network error"} for ${url}: ${(e as Error).message}` };
  }
}

export async function getJson<T>(url: string): Promise<{ data?: T; error?: string }> {
  const { text, error } = await getText(url, "application/json");
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

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
 * Local route handlers have no auth, so refuse cross-site requests: a page on another
 * origin must not be able to trigger scans or overwrite the database from the browser.
 */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}
