import type { NextRequest } from "next/server";
import { getDict } from "@/lib/i18n/server";
import { listOffers, parseFilters, toCsv } from "@/lib/repo/offers";

/** CSV of the currently filtered offer list (same query params as /app/jobs). UTF-8 with BOM so Excel reads accents. */
export async function GET(req: NextRequest) {
  const { t } = await getDict();
  const rows = listOffers(parseFilters(req.nextUrl.searchParams));
  const head = [
    "id", t.jobs.fields.title, t.jobs.fields.company, t.jobs.fields.type, t.jobs.fields.location, t.common.remote,
    t.jobs.score, t.offers2.verdict, t.offers2.col.status, t.jobs.fields.deadline, t.offers2.starred, t.jobs.fields.url,
    t.offers2.source, t.offers2.added,
  ];
  const body = rows.map((r) => [
    r.id, r.title, r.company, t.jobTypes[r.type], r.location, r.remote ? t.common.yes : t.common.no,
    r.score?.toFixed(1) ?? "", r.verdict ? t.verdicts[r.verdict] : "", r.status ? t.states[r.status as keyof typeof t.states] : "",
    r.deadline ?? "", r.starred ? t.common.yes : t.common.no, r.url.startsWith("manual://") ? "" : r.url, r.source, r.created_at.slice(0, 10),
  ]);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${toCsv([head, ...body])}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="khedma-offers-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
