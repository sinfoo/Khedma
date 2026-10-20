import { getApplication, getJob, getProfile } from "@/lib/db";
import { markdownToDocx } from "@/lib/cv/docx";
import { atsPlainText, normalizeForAts, paperFor, paperForLocation } from "@/lib/cv/export";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { getLocale } from "@/lib/i18n/server";
import { printToPdf } from "@/lib/cv/pdf";
import { fillPlaceholders } from "@/lib/ai/placeholders";
import { detectLanguage } from "@/lib/ai/heuristic";
import { docFacts } from "@/lib/apply/doc-facts";

/**
 * Download the tailored CV or cover letter: ?doc=cv|letter&format=pdf|docx|md|txt[&paper=a4|letter][&inline=1]
 * Text is ATS-normalised (dashes, quotes, zero-width, NBSP); paper follows the offer's
 * country, else the profile's target countries. `txt` is the single-column ATS export.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const app = Number.isInteger(id) && id > 0 ? getApplication(id) : null;
  const job = app && getJob(app.job_id);
  if (!app || !job) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const doc = sp.get("doc");
  const format = sp.get("format");
  if ((doc !== "cv" && doc !== "letter") || (format !== "pdf" && format !== "docx" && format !== "md" && format !== "txt")) return new Response("Bad request", { status: 400 });
  const raw = doc === "cv" ? app.cv_md : app.cover_letter_md;
  if (!raw?.trim()) return new Response("Nothing to export", { status: 404 });
  const md = normalizeForAts(fillPlaceholders(raw, docFacts(id, detectLanguage(raw))).md);
  const p = sp.get("paper");
  const paper = p === "a4" || p === "letter" ? p : (paperForLocation(job.location) ?? paperFor(getProfileExtra().places.countries));
  if (format === "pdf") {
    // Print our own print page on loopback (never the Host header) so the PDF matches the preview.
    const port = new URL(req.url).port || process.env.PORT || "3000";
    const pdf = await printToPdf(`http://127.0.0.1:${port}/print/${id}?doc=${doc}&paper=${paper}&pdf=1`).catch(() => null);
    if (!pdf) return new Response("No PDF printer available", { status: 501 });
    // The name the document itself carries (first line), else the profile's.
    const first = md.split("\n").map((l) => l.replace(/[*#_\\]/g, "").trim()).find(Boolean) ?? "";
    const who = /^[\p{L}' -]{3,40}$/u.test(first) && first.split(" ").length <= 5 ? first : getProfile().name || "Candidat";
    const name = `${doc === "cv" ? "CV" : "Lettre"} - ${who} - ${job.company}`.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 100);
    const ascii = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "");
    return new Response(pdf as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}.pdf`,
        "cache-control": "no-store",
      },
    });
  }
  const slug = `${getProfile().name}-${doc}-${job.company}`
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .toLowerCase();
  const headers = { "content-disposition": `attachment; filename="${slug}.${format}"`, "cache-control": "no-store", "x-paper": paper };
  if (format === "md") return new Response(md, { headers: { ...headers, "content-type": "text/markdown; charset=utf-8" } });
  if (format === "txt") {
    const text = doc === "cv" ? atsPlainText(md, await getLocale()) : md;
    return new Response(text, { headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
  }
  const bytes = markdownToDocx(md, { title: `${job.title} - ${job.company}`, paper });
  return new Response(bytes as BodyInit, {
    headers: { ...headers, "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  });
}
