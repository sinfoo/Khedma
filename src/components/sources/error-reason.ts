import type { Dict } from "@/lib/i18n/dict";

/** A raw source or scan error ("HTTP 500 for …", "Timeout for …", "Missing env: X") as a short reason in the UI language. */
export function errorReason(t: Dict, raw: string | null | undefined): string {
  const r = t.sources2.reasonsErr;
  const e = raw ?? "";
  if (/Missing env/i.test(e)) return r.key;
  if (/HTTP (401|403)\b/.test(e)) return r.blocked;
  if (/HTTP 404\b/.test(e)) return r.notFound;
  if (/HTTP 429\b/.test(e)) return r.rateLimit;
  if (/HTTP 5\d\d\b/.test(e)) return r.server;
  if (/timeout|timed out/i.test(e)) return r.timeout;
  if (/network|fetch failed|ENOTFOUND|ECONN|unreachable/i.test(e)) return r.offline;
  if (/invalid url|only http|private or local|eures:|invalid [\w -]+(board|company|host)/i.test(e)) return r.settings;
  if (/interrupted/i.test(e)) return r.interrupted;
  return r.unreadable;
}
