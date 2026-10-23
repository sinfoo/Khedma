import { getProfile } from "@/lib/db";
import { getCvSource, sectionizeToMarkdown } from "@/lib/cv/source";
import { markdownToDocx } from "@/lib/cv/docx";
import { normalizeForAts, paperFor } from "@/lib/cv/export";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { getDocStyle } from "@/lib/cv/doc-style-store";
import { detectLanguage } from "@/lib/ai/heuristic";

/**
 * The profile CV as .docx (?accent=0b5cad&paper=a4|letter). Uses the Markdown CV, else the
 * converted upload. Text is ATS-normalised; paper defaults to the first target country.
 */
export async function GET(req: Request) {
  const src = getCvSource();
  if (!src.text.trim()) return Response.json({ ok: false, error: "No CV yet." }, { status: 404 });
  const md = normalizeForAts(src.format === "markdown" ? src.text : sectionizeToMarkdown(src.text));
  const sp = new URL(req.url).searchParams;
  const style = getDocStyle();
  const accent = sp.get("accent") || style.accent;
  const p = sp.get("paper");
  const paper = p === "a4" || p === "letter" ? p : paperFor(getProfileExtra().places.countries);
  const bytes = markdownToDocx(md, { title: "CV", author: getProfile().name, accent, font: style.font, size: style.size, lang: detectLanguage(md), paper });
  const base = (getProfile().name || "CV").normalize("NFKD").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "CV";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="CV_${base}.docx"`,
      "Cache-Control": "no-store",
      "X-Paper": paper,
    },
  });
}
