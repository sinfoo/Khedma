import { revalidatePath } from "next/cache";
import { autoScanDue, runScan, scanBusy, type ScanEvent } from "@/lib/repo/sources";
import { isSameOrigin } from "@/lib/sources/http";
import { JOB_TYPES, type JobType } from "@/lib/types";

/**
 * The running scan's events, kept so a page that comes back (navigation, reload) can reattach with GET.
 * Lives on globalThis so dev reloads of this module keep it. One scan at a time, so one log.
 */
interface Live {
  lines: string[];
  subs: Set<(line: string | null) => void>;
  stop: AbortController;
}
const g = globalThis as { __khedmaScanLive?: Live | null };
const NDJSON = { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" };
const enc = new TextEncoder();

/**
 * POST { keywords?, countries?, remote?, types?, negatives?, includeSenior?, ids?, keys? (retry these runs), trigger? }
 * Streams NDJSON events: plan, source running/done/error, job (each kept offer), liveness, sweep, done.
 * 409 when a scan is already running; 204 when an auto scan is not due yet.
 * Leaving the page does not stop the scan: only DELETE does.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request refused" }, { status: 403 });
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty body = search with the profile's places and keywords
  }
  const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim().slice(0, max)).filter(Boolean).slice(0, n);
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200) : undefined;
  const trigger = body.trigger === "auto" ? "auto" : "manual";
  const keywords = strs(body.keywords, 6, 60);
  const countries = strs(body.countries, 12, 8).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$|^REMOTE$/.test(c));
  const remote = body.remote === "only" || body.remote === "no" || body.remote === "yes" ? body.remote : undefined;
  const types = strs(body.types, 5, 12).filter((t): t is JobType => (JOB_TYPES as string[]).includes(t));
  const negatives = strs(body.negatives, 12, 40);
  const includeSenior = body.includeSenior === true;
  const keys = strs(body.keys, 60, 300);
  if (trigger === "auto" && !autoScanDue()) return new Response(null, { status: 204 });
  if (scanBusy() || g.__khedmaScanLive) return Response.json({ error: "A scan is already running" }, { status: 409 });

  const live: Live = { lines: [], subs: new Set(), stop: new AbortController() };
  g.__khedmaScanLive = live;
  const send = (e: ScanEvent | { type: "error"; error: string }) => {
    const line = `${JSON.stringify(e)}\n`;
    live.lines.push(line);
    for (const s of live.subs) s(line);
  };
  void (async () => {
    try {
      const run = await runScan({
        ids,
        trigger,
        onEvent: send,
        keywords: keywords.length ? keywords : undefined,
        countries: countries.length ? countries : undefined,
        remote,
        types: types.length ? types : undefined,
        negatives: negatives.length ? negatives : undefined,
        includeSenior,
        keys: keys.length ? keys : undefined,
        signal: live.stop.signal,
      });
      if (!run) send({ type: "error", error: "A scan is already running" });
      else revalidatePath("/app", "layout");
    } catch (e) {
      send({ type: "error", error: (e as Error).message });
    } finally {
      g.__khedmaScanLive = null;
      for (const s of live.subs) s(null);
    }
  })();
  return new Response(follow(live), { headers: NDJSON });
}

/**
 * Reattach to the running scan: every event so far, then the rest live. 204 when no scan is running.
 * `?status=1` only says whether one is running (the topbar's radar spins during a background scan).
 */
export function GET(req: Request) {
  const live = g.__khedmaScanLive;
  if (new URL(req.url).searchParams.has("status")) return Response.json({ running: !!live }, { headers: { "cache-control": "no-store" } });
  return live ? new Response(follow(live), { headers: NDJSON }) : new Response(null, { status: 204 });
}

/** Stop the running scan (the Stop button). It still records what it found so far. */
export function DELETE(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request refused" }, { status: 403 });
  g.__khedmaScanLive?.stop.abort();
  return new Response(null, { status: 204 });
}

/** A stream of the log from the start, closed when the scan ends; a reader going away only unsubscribes. */
function follow(live: Live): ReadableStream<Uint8Array> {
  let sub: ((line: string | null) => void) | null = null;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      sub = (line) => {
        try {
          if (line === null) controller.close();
          else controller.enqueue(enc.encode(line));
        } catch {
          // reader gone
        }
      };
      for (const l of live.lines) controller.enqueue(enc.encode(l));
      if (g.__khedmaScanLive !== live) controller.close();
      else live.subs.add(sub);
    },
    cancel() {
      if (sub) live.subs.delete(sub);
    },
  });
}
