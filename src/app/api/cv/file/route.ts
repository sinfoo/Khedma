import { getUpload, readUploadBytes } from "@/lib/cv/source";

/** Download the original uploaded CV (?backup=1 for the previous one). */
export async function GET(req: Request) {
  const backup = new URL(req.url).searchParams.get("backup") === "1";
  const up = getUpload(backup ? 1 : 0);
  const bytes = up && readUploadBytes(up);
  if (!up || !bytes) return Response.json({ ok: false, error: "No uploaded CV." }, { status: 404 });
  const ascii = up.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": up.mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(up.fileName)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
