import { revalidatePath } from "next/cache";
import { autoScanDue, runScan, scanBusy, type ScanEvent } from "@/lib/repo/sources";
import { isSameOrigin } from "@/lib/sources/http";
import { JOB_TYPES, type JobType } from "@/lib/types";

/**
 * POST { keywords?, countries?, remote?, types?, negatives?, includeSenior?, ids?, trigger? }
 * Streams NDJSON events: plan, source running/done/error, job (each kept offer), liveness, sweep, done.
 * 409 when a scan is already running; 204 when an auto scan is not due yet.
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
  if (trigger === "auto" && !autoScanDue()) return new Response(null, { status: 204 });
  if (scanBusy()) return Response.json({ error: "A scan is already running" }, { status: 409 });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ScanEvent | { type: "error"; error: string }) => {
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // client went away; the scan still finishes and is recorded
        }
      };
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
        });
        if (!run) send({ type: "error", error: "A scan is already running" });
        else revalidatePath("/app", "layout");
      } catch (e) {
        send({ type: "error", error: (e as Error).message });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
