import type { NextRequest } from "next/server";
import { getForYou } from "@/lib/recommend";

/** JSON of the Discover page: candidate model, ranked offers, next actions, skills to learn, roles, sources, companies. */
export async function GET(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get("limit") ?? 12);
  const limit = Number.isFinite(raw) ? Math.min(50, Math.max(1, Math.round(raw))) : 12;
  try {
    const data = await getForYou(limit);
    return Response.json(data, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.warn("[discover] for-you failed:", (e as Error).message);
    return Response.json({ error: "recommendations_failed" }, { status: 500 });
  }
}
