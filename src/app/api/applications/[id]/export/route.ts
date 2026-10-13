import { getApplication, getJob } from "@/lib/db";
import { markdownToDocx } from "@/lib/cv/docx";
import { atsPlainText, normalizeForAts, paperFor, paperForLocation } from "@/lib/cv/export";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { getLocale } from "@/lib/i18n/server";

/**
 * Download the tailored CV or cover letter: ?doc=cv|letter&format=docx|md|txt[&paper=a4|letter]
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
  if ((doc !== "cv" && doc !== "letter") || (format !== "docx" && format !== "md" && format !== "txt")) return new Response("Bad request", { status: 400 });
  const raw = doc === "cv" ? app.cv_md : app.cover_letter_md;
  if (!raw?.trim()) return new Response("Nothing to export", { status: 404 });
  const md = normalizeForAts(raw);
  const p = sp.get("paper");
  const paper = p === "a4" || p === "letter" ? p : (paperForLocation(job.location) ?? paperFor(getProfileExtra().places.countries));
  const slug = `${doc}-${job.company}-${job.title}`
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
