import { getProfile } from "@/lib/db";
import { getCvSource, sectionizeToMarkdown } from "@/lib/cv/source";
import { markdownToDocx } from "@/lib/cv/docx";

/** The profile CV as .docx (?accent=0b5cad). Uses the Markdown CV, else the converted upload. */
export async function GET(req: Request) {
  const src = getCvSource();
  if (!src.text.trim()) return Response.json({ ok: false, error: "No CV yet." }, { status: 404 });
  const md = src.format === "markdown" ? src.text : sectionizeToMarkdown(src.text);
  const accent = new URL(req.url).searchParams.get("accent") ?? "";
  const bytes = markdownToDocx(md, { accent });
  const base = (getProfile().name || "CV").normalize("NFKD").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "CV";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="CV_${base}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
