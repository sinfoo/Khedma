import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict } from "@/lib/i18n/server";
import { matchStory } from "@/lib/coach/logic";
import { getSession, listAnswers, listStories } from "@/lib/repo/coach";
import { PageHeader } from "@/components/kit";
import { fmtDate } from "@/components/ui";
import { Report } from "@/components/coach/report";
import { SessionRunner, type RunnerAnswer } from "@/components/coach/session-runner";

export const metadata: Metadata = { title: "Coach" };

export default async function CoachSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const id = Number(sessionId);
  const session = Number.isInteger(id) && id > 0 ? getSession(id) : null;
  if (!session) notFound();
  const { t, locale } = await getDict();
  const c = t.coach2;
  const answers = listAnswers(session.id);
  const title = session.title || c.tracks[session.track];
  const meta = `${c.kinds[session.kind]} · ${c.langs[session.lang]} · ${c.levels[String(session.level) as "1" | "2" | "3"]} · ${fmtDate(session.created_at, locale)}`;

  if (session.status === "done") {
    return (
      <>
        <PageHeader eyebrow={c.report.heading} title={title} lead={meta} back={{ href: "/app/coach", label: c.title }} />
        <Report session={session} answers={answers} t={t} locale={locale} />
      </>
    );
  }

  const initial: Record<number, RunnerAnswer> = {};
  for (const a of answers) initial[a.idx] = { answer: a.answer, skipped: a.skipped, scores: a.scores, overall: a.overall, feedback: a.feedback, engine: a.engine, seconds: a.seconds };
  const stories = listStories();
  const suggestions: Record<number, { id: number; title: string }> = {};
  session.questions.forEach((q, i) => {
    const s = matchStory(stories, q);
    if (s) suggestions[i] = { id: s.id, title: s.title };
  });

  return (
    <>
      <PageHeader eyebrow={c.title} title={title} lead={meta} back={{ href: "/app/coach", label: c.title }} />
      <SessionRunner sessionId={session.id} lang={session.lang} questions={session.questions} initial={initial} stories={suggestions} />
    </>
  );
}
