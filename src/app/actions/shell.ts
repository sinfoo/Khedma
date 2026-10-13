"use server";

import { db } from "@/lib/db";

export interface SearchHit {
  kind: "offer" | "application";
  id: number;
  title: string;
  sub: string;
  href: string;
}

/** Global search for the command palette: offers by title/company/tags, applications by job. */
export async function searchEverything(q: string): Promise<SearchHit[]> {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const rows = db()
    .prepare(
      `SELECT j.id, j.title, j.company, j.location, a.id AS app_id, a.status
       FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
       WHERE j.archived = 0 AND (j.title LIKE ? OR j.company LIKE ? OR j.tags LIKE ? OR j.location LIKE ?)
       ORDER BY (a.id IS NOT NULL) DESC, j.created_at DESC LIMIT 12`,
    )
    .all(like, like, like, like) as { id: number; title: string; company: string; location: string; app_id: number | null; status: string | null }[];
  return rows.map((r) =>
    r.app_id
      ? { kind: "application", id: r.app_id, title: r.title, sub: `${r.company} · ${r.status}`, href: `/app/pipeline/${r.app_id}` }
      : { kind: "offer", id: r.id, title: r.title, sub: [r.company, r.location].filter(Boolean).join(" · "), href: `/app/jobs/${r.id}` },
  );
}
