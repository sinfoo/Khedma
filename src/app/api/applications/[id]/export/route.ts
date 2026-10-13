import { getApplication, getJob } from "@/lib/db";
import { markdownToDocx } from "@/lib/cv/docx";

/** Download the tailored CV or cover letter: ?doc=cv|letter&format=docx|md */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const app = Number.isInteger(id) && id > 0 ? getApplication(id) : null;
  const job = app && getJob(app.job_id);
  if (!app || !job) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const doc = sp.get("doc");
  const format = sp.get("format");
  if ((doc !== "cv" && doc !== "letter") || (format !== "docx" && format !== "md")) return new Response("Bad request", { status: 400 });
  const md = doc === "cv" ? app.cv_md : app.cover_letter_md;
  if (!md?.trim()) return new Response("Nothing to export", { status: 404 });
  const slug = `${doc}-${job.company}-${job.title}`
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .toLowerCase();
  const headers = { "content-disposition": `attachment; filename="${slug}.${format}"`, "cache-control": "no-store" };
  if (format === "md") return new Response(md, { headers: { ...headers, "content-type": "text/markdown; charset=utf-8" } });
  const bytes = markdownToDocx(md, { title: `${job.title} — ${job.company}` });
  return new Response(bytes as BodyInit, {
    headers: { ...headers, "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  });
}
