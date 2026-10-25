import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, KanbanSquare } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { listApplications } from "@/lib/db";
import { allInterviewStarts, cadenceFor, contactCounts, localDate, pipelineStats, stageEnteredAt } from "@/lib/repo/apps";
import { EmptyState, PageHeader } from "@/components/kit";
import { PipelineBoard, type BoardItem } from "@/components/pipeline-board";
import { daysSince } from "@/components/pipeline/format";
import { toView } from "@/components/pipeline/cadence";

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
  const cadence = cadenceFor(apps.map((x) => ({ id: x.id, status: x.status, applied_at: x.applied_at, company: x.job.company })), now);

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
    url: x.job.url,
    location: x.job.location,
    source: x.job.source,
    cadence: toView(cadence.get(x.id)),
    deadline: x.job.deadline,
    docs: { cv: !!x.cv_md?.trim(), letter: !!x.cover_letter_md?.trim() },
  }));
  const s = pipelineStats(apps, interviews, now);

  return (
    <>
      <PageHeader
        title={t.pipeline.title}
        lead={s.responseRate === null ? fmt(a.flow.leadNoRate, { active: s.active, iv: s.interviewsThisWeek }) : fmt(a.flow.lead, { active: s.active, rate: `${s.responseRate}%`, iv: s.interviewsThisWeek })}
        actions={
          <a href="/api/ics/all" className="btn btn-outline" download title={a.board.exportIcs}>
            <CalendarPlus size={15} aria-hidden="true" /> {a.flow.ics}
          </a>
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={<KanbanSquare aria-hidden="true" />} title={a.board.emptyTitle} hint={a.board.emptyHint}>
          <Link href="/app/jobs" className="btn btn-primary btn-lg">{a.board.emptyCta}</Link>
        </EmptyState>
      ) : (
        <PipelineBoard items={items} initialView={sp.view === "table" ? "table" : "board"} />
      )}
    </>
  );
}
