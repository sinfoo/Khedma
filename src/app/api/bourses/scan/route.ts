import { revalidatePath } from "next/cache";
import { scanFeeds, scanRunning, scanState, type ScanEvent } from "@/lib/bourses/store";
import { isSameOrigin } from "@/lib/sources/http";

const NDJSON = { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" };

/**
 * POST { force?: boolean }: read the scholarship feeds. Streams NDJSON events: plan, feed running, feed done / error /
 * cached (with new, updated and unchanged counts), then done with the totals. 409 when a scan is already running.
 * Feeds read less than 15 minutes ago are not fetched again unless `force` is set.
 * Leaving the page does not stop the scan: it finishes and stores what it read.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request refused" }, { status: 403 });
  let force = false;
  try {
    force = ((await req.json()) as { force?: unknown })?.force === true;
  } catch {
    // empty body: a normal scan
  }
  if (scanRunning()) return Response.json({ error: "A scan is already running" }, { status: 409 });

  const enc = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: ScanEvent | { type: "error"; error: string }) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false; // reader gone
        }
      };
      void scanFeeds({ force, onEvent: send })
        .then((state) => {
          if (!state) return send({ type: "error", error: "A scan is already running" });
          try {
            revalidatePath("/app/bourses");
          } catch {
            // The response is already streaming; the page refreshes itself when the stream ends.
          }
        })
        .catch((e: unknown) => send({ type: "error", error: (e as Error).message }))
        .finally(() => {
          if (open) controller.close();
        });
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, { headers: NDJSON });
}

/** The last scan: when it ended and what each feed gave. */
export function GET() {
  return Response.json({ running: scanRunning(), ...scanState() }, { headers: { "cache-control": "no-store" } });
}
