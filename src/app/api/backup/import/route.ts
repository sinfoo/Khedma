import { revalidatePath } from "next/cache";
import { isSameOrigin } from "@/lib/sources/http";
import { previewBackup, restoreBackup, validateBackup } from "../backup";

const MAX_BYTES = 60 * 1024 * 1024;

/**
 * POST ?mode=preview|merge|replace with the backup JSON as body.
 * preview: { exported_at, tables: [{ table, backup, current }] }; merge/replace: { inserted }.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request refused" }, { status: 403 });
  if (!req.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Expected application/json" }, { status: 415 });
  const mode = new URL(req.url).searchParams.get("mode") ?? "preview";
  if (mode !== "preview" && mode !== "merge" && mode !== "replace") return Response.json({ error: "Unknown mode" }, { status: 400 });
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > MAX_BYTES) return Response.json({ error: "too-large" }, { status: 413 });

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return Response.json({ error: "too-large" }, { status: 413 });
    raw = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid-json" }, { status: 400 });
  }
  const { backup, error } = validateBackup(raw);
  if (!backup) return Response.json({ error }, { status: 422 });
  if (mode === "preview") return Response.json({ exported_at: backup.exported_at, tables: previewBackup(backup) });
  try {
    const r = restoreBackup(backup, mode);
    revalidatePath("/app", "layout");
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
