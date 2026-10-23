import { readFile } from "node:fs/promises";
import path from "node:path";

// OCR engine files served from the installed packages, so reading a scanned CV needs no third-party download:
// the Tesseract worker and WebAssembly core (Apache-2.0), the French and English models (MIT packaging of
// tessdata), and the PDF.js worker (Apache-2.0). Only these names are served; nothing else in node_modules is.
const NM = path.join(process.cwd(), "node_modules");
const TYPES: Record<string, string> = { ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".gz": "application/gzip" };

function resolve(parts: string[]): string | null {
  const [head, file = ""] = parts;
  if (parts.length === 1 && head === "worker.min.js") return path.join(NM, "tesseract.js", "dist", "worker.min.js");
  if (parts.length === 1 && head === "pdf.worker.min.mjs") return path.join(NM, "pdfjs-dist", "build", "pdf.worker.min.mjs");
  if (parts.length === 2 && head === "core" && /^tesseract-core[\w-]*\.(wasm\.js|wasm|js)$/.test(file)) return path.join(NM, "tesseract.js-core", file);
  const lang = /^(eng|fra)\.traineddata\.gz$/.exec(file);
  if (parts.length === 2 && head === "lang" && lang) return path.join(NM, "@tesseract.js-data", lang[1], "4.0.0_best_int", file);
  return null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const file = resolve((await ctx.params).path);
  if (!file) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(file);
    const ext = file.endsWith(".wasm.js") ? ".js" : path.extname(file);
    return new Response(new Uint8Array(body), { headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
