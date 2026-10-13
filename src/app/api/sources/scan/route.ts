import { revalidatePath } from "next/cache";
import { autoScanDue, runScan, scanBusy, type ScanEvent } from "@/lib/repo/sources";
import { isSameOrigin } from "@/lib/sources/http";

/**
 * POST { ids?: number[], trigger?: "manual" | "auto" }
 * Streams NDJSON progress events (start, source running/done/error, done).
 * 409 when a scan is already running; 204 when an auto scan is not due yet.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request refused" }, { status: 403 });
  let body: { ids?: unknown; trigger?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty body = scan all enabled sources
  }
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200) : undefined;
  const trigger = body.trigger === "auto" ? "auto" : "manual";
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
        const run = await runScan({ ids, trigger, onEvent: send });
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
