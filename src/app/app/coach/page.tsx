import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MessagesSquare } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { listApplications } from "@/lib/db";
import { BANK } from "@/lib/coach/bank";
import { allInterviewStarts } from "@/lib/repo/apps";
import { drillStates, listSessions, listStories } from "@/lib/repo/coach";
import { ScoreRing, fmtDate, scoreColor, scoreLabel } from "@/components/ui";
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
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const next = new Map<number, string>();
  for (const iv of allInterviewStarts()) if (iv.starts_at.slice(0, 10) >= today && !next.has(iv.application_id)) next.set(iv.application_id, iv.starts_at);
  const apps = listApplications()
    .filter((a) => a.status !== "discarded")
    .map((a) => ({ id: a.id, title: a.job.title, company: a.job.company, interviewAt: next.get(a.id) ?? null }))
    .sort((a, b) => (a.interviewAt ?? "9").localeCompare(b.interviewAt ?? "9"));
  const sessions = listSessions();
  const done = sessions.filter((s) => s.status === "done" && s.score !== null);
  const last4 = done.slice(0, 4).reverse();
  const avg = done.length ? done.reduce((n, s) => n + s.score!, 0) / done.length : null;
  const trendUp = last4.length >= 2 && last4[last4.length - 1].score! > last4[0].score!;
  const stories = listStories().length;
  const due = dueCount(now.getTime());
  const suggested = apps.find((a) => a.interviewAt);
  const suggestedLabel = suggested?.interviewAt
    ? `${new Date(suggested.interviewAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit" })} · ${c.start.suggested}`
    : undefined;
  const lead = [done.length ? fmt(c.lead2.sessions, { n: done.length }) : null, avg !== null ? fmt(c.lead2.average, { n: avg.toFixed(1) }) : null, trendUp ? c.lead2.up : null].filter(Boolean).join(" · ") || c.lead;

  return (
    <>
      <header className="mb-[18px] flex flex-wrap items-end justify-between gap-4 rise">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-[1.1] tracking-[-0.025em] sm:text-[2rem]">{c.title}</h1>
          <p className="mt-1.5 text-muted">{lead}</p>
        </div>
        <CoachTabs t={t} current="practice" counts={{ stories, drill: due }} />
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <StartForm apps={apps} preselect={Number.isInteger(pre) && pre > 0 ? pre : (suggested?.id ?? null)} locale={locale} suggestedLabel={suggestedLabel} />

        <section className="card p-4" aria-labelledby="progress-h">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 id="progress-h" className="card-title text-[0.9rem]">{c.history.progress}</h2>
            <span className="text-[0.75rem] text-muted">{c.history.last4}</span>
          </div>
          {last4.length > 0 ? (
            <div className="flex h-[90px] items-end gap-2.5 px-1" role="img" aria-label={c.history.trend}>
              {last4.map((s) => (
                <div key={s.id} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="mono text-[0.7rem] text-muted">{s.score!.toFixed(1)}</span>
                  <div className="w-full rounded-t-md rounded-b-[2px]" style={{ height: `${(s.score! / 5) * 100}%`, background: scoreColor(s.score!), transition: "height .9s cubic-bezier(.2,.7,.2,1)" }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-5 text-center">
              <div className="tile tone-accent mx-auto mb-2.5 !rounded-2xl">
                <MessagesSquare size={20} aria-hidden="true" />
              </div>
              <p className="font-semibold">{c.history.empty}</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{c.history.emptyHint}</p>
            </div>
          )}
          {sessions.length > 0 && (
            <ul className="mt-3.5 flex flex-col">
              {sessions.slice(0, 6).map((s) => (
                <li key={s.id} className="border-t border-line">
                  <Link href={`/app/coach/${s.id}`} className="group flex items-center gap-2.5 px-1 py-2.5 text-ink">
                    {s.status === "done" && s.score !== null ? (
                      <ScoreRing value={s.score} size={34} label={scoreLabel(t, s.score)} animate={false} />
                    ) : (
                      <span className="mono grid size-[34px] shrink-0 place-items-center rounded-full border border-dashed border-saffron text-[0.68rem] text-saffron" aria-hidden="true">
                        {s.answered}/{s.questions.length}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.85rem] font-medium">{s.title || c.tracks[s.track]}</span>
                      <span className="block truncate text-[0.72rem] text-muted">
                        {c.kinds[s.kind]} · {s.lang.toUpperCase()} · {fmtDate(s.created_at, locale)} · {fmt(c.history.answered, { a: s.answered, n: s.questions.length })}
                      </span>
                    </span>
                    {s.status === "active" && <span className="text-[0.72rem] font-semibold text-saffron">{c.history.resume}</span>}
                    <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
