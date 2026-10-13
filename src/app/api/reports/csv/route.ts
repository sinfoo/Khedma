import { getDict } from "@/lib/i18n/server";
import { toCsv } from "@/lib/repo/offers";
import { loadReportsData } from "@/lib/reports/repo";
import type { JobType } from "@/lib/types";

/** Full application history as CSV (UTF-8 with BOM so Excel reads accents). */
export async function GET() {
  const { t } = await getDict();
  const r = t.apply2.reports;
  const o = t.apply2.outcome.outcomes;
  const head = ["id", r.col.offer, r.col.company, r.col.type, r.col.status, r.col.score, r.col.verdict, r.col.created, r.col.applied, r.col.deadline, r.col.channel, r.col.outcome, r.col.lesson];
  const body = loadReportsData().apps.map((a) => [
    a.id, a.job.title, a.job.company, t.jobTypes[a.type as JobType] ?? a.type, t.states[a.status], a.score?.toFixed(1) ?? "",
    a.verdict ? t.verdicts[a.verdict as keyof typeof t.verdicts] : "", a.created_at.slice(0, 10), a.applied_at?.slice(0, 10) ?? "", a.job.deadline ?? "",
    a.channel ? t.apply2.submit.channels[a.channel] : "", a.outcome ? o[a.outcome] : "", a.lesson,
  ]);
  return new Response(`﻿${toCsv([head, ...body])}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="khedma-applications-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}

