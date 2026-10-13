// Receives offers clipped from the user's own browser session (bookmarklet in public/khedma-clipper.js).
// Cross-origin by design (the page is linkedin.com etc.), so a per-install token guards the write.
import { upsertJob, type NewJob } from "@/lib/db";
import { clipToken } from "@/lib/clip";
import { extractTags, guessRemote, guessType, normalizeDate } from "@/lib/sources/classify";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function POST(req: Request) {
  let body: { token?: string; site?: string; jobs?: unknown[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad json" }, { status: 400, headers: CORS });
  }
  if (!body.token || body.token !== clipToken()) return Response.json({ error: "bad token" }, { status: 403, headers: CORS });
  const site = str(body.site, 80).toLowerCase();
  const source: NewJob["source"] = /linkedin/.test(site) ? "linkedin" : "url";
  let added = 0;
  let known = 0;
  const ids: number[] = [];
  for (const raw of (Array.isArray(body.jobs) ? body.jobs : []).slice(0, 60)) {
    const j = (raw ?? {}) as Record<string, unknown>;
    const url = str(j.url, 1000);
    const title = str(j.title, 200);
    if (!/^https?:\/\//.test(url) || !title) continue;
    const description = String(j.description ?? "").trim().slice(0, 20_000);
    const job: NewJob = {
      title,
      company: str(j.company, 200) || site.replace(/^www\./, ""),
      location: str(j.location, 200),
      remote: guessRemote(`${title} ${str(j.location, 200)} ${description.slice(0, 500)}`),
      url,
      source,
      type: guessType(title, description),
      description,
      tags: extractTags(title, description),
      posted_at: normalizeDate(typeof j.posted_at === "string" ? j.posted_at : null),
      deadline: normalizeDate(typeof j.deadline === "string" ? j.deadline : null),
    };
    const r = upsertJob(job);
    if (r.inserted) {
      added++;
      ids.push(r.id);
    } else known++;
  }
  return Response.json({ added, known, ids }, { headers: CORS });
}
