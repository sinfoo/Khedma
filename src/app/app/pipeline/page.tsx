import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, KanbanSquare } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { listApplications } from "@/lib/db";
import { allInterviewStarts, contactCounts, localDate, pipelineStats, stageEnteredAt } from "@/lib/repo/apps";
import { EmptyState, PageHeader, Stat } from "@/components/kit";
import { PipelineBoard, type BoardItem } from "@/components/pipeline-board";
import { daysSince } from "@/components/pipeline/format";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: PageProps<"/app/pipeline">) {
  const { t } = await getDict();
  const sp = await searchParams;
  const a = t.apps2;
  const apps = listApplications();
  const now = new Date();
  const nowMs = now.getTime();
  const today = localDate(now);
  const entered = stageEnteredAt();
  const contacts = contactCounts();
  const interviews = allInterviewStarts();
  const nextInterview = new Map<number, string>();
  for (const iv of interviews) if (iv.starts_at.slice(0, 10) >= today && !nextInterview.has(iv.application_id)) nextInterview.set(iv.application_id, iv.starts_at);

  const items: BoardItem[] = apps.map((x) => ({
    id: x.id,
    status: x.status,
    title: x.job.title,
    company: x.job.company,
    type: x.job.type,
    score: x.evaluation?.global ?? null,
    updated_at: x.updated_at,
    stageDays: daysSince(entered.get(x.id) ?? x.updated_at, nowMs),
    next_action_at: x.next_action_at,
    overdue: !!x.next_action_at && x.next_action_at.slice(0, 10) < today,
    interviewAt: nextInterview.get(x.id) ?? null,
    contacts: contacts.get(x.id) ?? 0,
  }));
  const s = pipelineStats(apps, interviews, now);

  return (
    <>
      <PageHeader
        eyebrow={a.board.eyebrow}
        title={t.pipeline.title}
        lead={a.board.lead}
        actions={
          <a href="/api/ics/all" className="btn btn-secondary" download>
            <CalendarPlus size={16} aria-hidden="true" /> {a.board.exportIcs}
          </a>
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={<KanbanSquare size={22} aria-hidden="true" />} title={a.board.emptyTitle} hint={a.board.emptyHint}>
          <Link href="/app/jobs" className="btn btn-primary">{a.board.emptyCta}</Link>
        </EmptyState>
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat i={1} label={a.stats.active} value={s.active} hint={fmt(a.stats.activeHint, { n: items.length })} />
            <Stat i={2} label={a.stats.responseRate} value={s.responseRate === null ? "—" : `${s.responseRate}%`} hint={fmt(a.stats.responseHint, { n: s.applied })} />
            <Stat i={3} label={a.stats.interviewsWeek} value={s.interviewsThisWeek} hint={a.stats.weekHint} />
          </dl>
          <PipelineBoard items={items} initialView={sp.view === "table" ? "table" : "board"} />
        </>
      )}
    </>
  );
}
