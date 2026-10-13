import { db } from "./db";

export interface Notice {
  key: string;
  title: string;
  sub: string;
  href: string;
  at: string;
  kind: "reminder" | "interview" | "deadline";
  overdue: boolean;
}

/** Due reminders, interviews in the next 48h and offer deadlines in the next 3 days. */
export function getNotices(): Notice[] {
  const d = db();
  const now = new Date();
  const soon = new Date(now.getTime() + 48 * 3600_000).toISOString().slice(0, 16);
  const today = now.toISOString().slice(0, 10);
  const in3 = new Date(now.getTime() + 3 * 86400_000).toISOString().slice(0, 10);
  const reminders = d
    .prepare(
      `SELECT r.id, r.title, r.due_at, r.application_id, r.job_id, j.company FROM reminders r
       LEFT JOIN applications a ON a.id = r.application_id
       LEFT JOIN jobs j ON j.id = COALESCE(r.job_id, a.job_id)
       WHERE r.done = 0 AND substr(r.due_at, 1, 10) <= ? ORDER BY r.due_at LIMIT 20`,
    )
    .all(in3) as { id: number; title: string; due_at: string; application_id: number | null; job_id: number | null; company: string | null }[];
  const interviews = d
    .prepare(
      `SELECT i.id, i.starts_at, i.kind, i.application_id, j.company, j.title FROM interviews i
       JOIN applications a ON a.id = i.application_id JOIN jobs j ON j.id = a.job_id
       WHERE i.starts_at >= ? AND i.starts_at <= ? ORDER BY i.starts_at LIMIT 10`,
    )
    .all(now.toISOString().slice(0, 16), soon) as { id: number; starts_at: string; kind: string; application_id: number; company: string; title: string }[];
  const deadlines = d
    .prepare(
      `SELECT j.id, j.title, j.company, j.deadline FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
       WHERE j.archived = 0 AND j.deadline IS NOT NULL AND j.deadline >= ? AND j.deadline <= ?
       AND (a.id IS NULL OR a.status = 'evaluated') ORDER BY j.deadline LIMIT 10`,
    )
    .all(today, in3) as { id: number; title: string; company: string; deadline: string }[];
  return [
    ...interviews.map((i) => ({
      key: `i${i.id}`,
      title: `${i.company} — ${i.kind}`,
      sub: i.title,
      href: `/app/pipeline/${i.application_id}`,
      at: i.starts_at,
      kind: "interview" as const,
      overdue: false,
    })),
    ...reminders.map((r) => ({
      key: `r${r.id}`,
      title: r.title,
      sub: r.company ?? "",
      href: r.application_id ? `/app/pipeline/${r.application_id}` : r.job_id ? `/app/jobs/${r.job_id}` : "/app/calendar",
      at: r.due_at,
      kind: "reminder" as const,
      overdue: r.due_at.slice(0, 10) < today,
    })),
    ...deadlines.map((j) => ({
      key: `d${j.id}`,
      title: j.title,
      sub: j.company,
      href: `/app/jobs/${j.id}`,
      at: j.deadline,
      kind: "deadline" as const,
      overdue: false,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}
