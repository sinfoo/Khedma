// POST { ids: number[] } → { results: JobCheck[] }. Checks up to 100 offers, 3 in flight, results persisted in job_checks.
import { checkJobs } from "@/lib/company/liveness";
import { isSameOrigin } from "@/lib/sources/http";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const raw = (body as { ids?: unknown })?.ids;
  const ids = Array.isArray(raw) ? [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 100) : [];
  if (!ids.length) return Response.json({ error: "ids required" }, { status: 400 });
  const results = await checkJobs(ids);
  return Response.json({ results }, { headers: { "cache-control": "no-store" } });
}
