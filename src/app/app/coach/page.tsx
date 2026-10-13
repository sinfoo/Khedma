import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MessagesSquare } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { listApplications } from "@/lib/db";
import { BANK } from "@/lib/coach/bank";
import { drillStates, listSessions, listStories } from "@/lib/repo/coach";
import { PageHeader, Section, Sparkline, Stat } from "@/components/kit";
import { ScoreRing, fmtDate, scoreLabel } from "@/components/ui";
import { CoachTabs } from "@/components/coach/parts";
import { StartForm } from "@/components/coach/start-form";

export const metadata: Metadata = { title: "Coach" };

function dueCount(now: number) {
  const states = drillStates();
  return BANK.filter((q) => q.type === "technical").filter((q) => {
    const s = states.get(q.id);
    return s && Date.parse(s.due_at) <= now;
  }).length;
}

export default async function CoachPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t, locale } = await getDict();
  const c = t.coach2;
  const sp = await searchParams;
  const pre = Number(sp.application);
  const apps = listApplications()
    .filter((a) => a.status !== "discarded")
    .map((a) => ({ id: a.id, title: a.job.title, company: a.job.company }));
  const sessions = listSessions();
  const done = sessions.filter((s) => s.status === "done" && s.score !== null);
  const trend = done.slice(0, 12).map((s) => s.score!).reverse();
  const avg = done.length ? done.reduce((n, s) => n + s.score!, 0) / done.length : null;
  const stories = listStories().length;
  const due = dueCount(new Date().getTime());

  return (
    <>
      <PageHeader eyebrow={c.eyebrow} title={c.title} lead={c.lead} />
      <CoachTabs t={t} current="practice" />

      <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat i={0} label={c.stats.sessions} value={done.length} trend={trend.length > 1 ? trend : undefined} />
        <Stat i={1} label={c.stats.average} value={avg === null ? "—" : avg.toFixed(1)} hint={avg === null ? undefined : "/ 5"} />
        <Stat i={2} label={c.stats.stories} value={stories} />
        <Stat i={3} label={c.stats.due} value={due} />
      </dl>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Section id="coach-start" title={c.start.heading} i={1}>
          <StartForm apps={apps} preselect={Number.isInteger(pre) && pre > 0 ? pre : null} locale={locale} />
        </Section>

        <Section
          id="coach-history"
          title={c.history.heading}
          i={2}
          actions={trend.length > 1 ? <span title={c.history.trend}><span className="sr-only">{c.history.trend}</span><Sparkline values={trend} width={96} height={28} /></span> : undefined}
        >
          {sessions.length === 0 ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent-text">
                <MessagesSquare size={20} aria-hidden="true" />
              </div>
              <p className="font-semibold">{c.history.empty}</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{c.history.emptyHint}</p>
            </div>
          ) : (
            <ul className="-mx-2 divide-y divide-line">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link href={`/app/coach/${s.id}`} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-2">
                    {s.status === "done" && s.score !== null ? (
                      <ScoreRing value={s.score} size={40} label={scoreLabel(t, s.score)} animate={false} />
                    ) : (
                      <span className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-xs text-muted" aria-hidden="true">
                        {s.answered}/{s.questions.length}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.title || c.tracks[s.track]}</span>
                      <span className="block truncate text-xs text-muted">
                        {c.kinds[s.kind]} · {s.lang.toUpperCase()} · {fmtDate(s.created_at, locale)} · {fmt(c.history.answered, { a: s.answered, n: s.questions.length })}
                      </span>
                    </span>
                    {s.status === "active" ? <span className="chip chip-saffron">{c.history.inProgress}</span> : null}
                    <span className="sr-only">{s.status === "active" ? c.history.resume : c.history.report}</span>
                    <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
