import { listApplications } from "@/lib/db";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote everything; neutralize spreadsheet formulas.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** Applications as CSV (UTF-8 with BOM so Excel reads accents). */
export async function GET() {
  const head = ["company", "title", "status", "type", "location", "applied_at", "next_action_at", "updated_at", "score", "url"];
  const rows = listApplications().map((a) => [
    a.job.company,
    a.job.title,
    a.status,
    a.job.type,
    a.job.location,
    a.applied_at?.slice(0, 10),
    a.next_action_at?.slice(0, 10),
    a.updated_at.slice(0, 10),
    a.evaluation?.global ?? "",
    a.job.url,
  ]);
  const csv = "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="khedma-applications-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
