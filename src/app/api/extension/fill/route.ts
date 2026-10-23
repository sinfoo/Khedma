import { clipToken } from "@/lib/clip";
import { fillData } from "@/lib/fill";

/**
 * GET ?url=<the form's page> with header x-khedma-token: the data the Khedma Fill extension puts into a form.
 * No CORS header on purpose: only the extension (allowed by its host permission) can read this, never a web page;
 * the token (same per-install secret as the clipper) guards it as well.
 */
export function GET(req: Request) {
  if (req.headers.get("x-khedma-token") !== clipToken()) return Response.json({ error: "bad token" }, { status: 403 });
  const url = new URL(req.url).searchParams.get("url") ?? "";
  return Response.json(fillData(/^https?:\/\//.test(url) ? url.slice(0, 2000) : ""), { headers: { "cache-control": "no-store" } });
}
