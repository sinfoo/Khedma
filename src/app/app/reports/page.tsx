import { pageTitle } from "@/lib/i18n/title";
import Link from "next/link";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, Download, FileText, Lightbulb, Printer, Trophy } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { loadReportsData, weeklyDigest } from "@/lib/reports/repo";
import { addDays, localDate, weekStart } from "@/lib/reports/digest";
import { CompanyAvatar, EmptyState, PageHeader } from "@/components/kit";
import { ScoreRing, StateChip, fmtDate, scoreLabel } from "@/components/ui";
import { PolishFocus } from "@/components/reports/polish";
import { CalibrationCard, SilentCard } from "@/components/insights/calibration";
import type { JobType } from "@/lib/types";

export const generateMetadata = pageTitle("reports");

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { t, locale } = await getDict();
  const r = t.apply2.reports;
  const today = localDate(new Date());
  const week = weekStart(typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today);
  const data = loadReportsData();
  const d = weeklyDigest(week, data);
  const isCurrent = week === weekStart(today);
  const date = (s: string | null) => fmtDate(s, locale);
  const o = t.apply2.outcome.outcomes;

  if (!data.apps.length && !data.digestInput.jobs.length) {
    return (
      <>
        <PageHeader eyebrow={r.eyebrow} title={r.title} lead={r.lead} />
        <EmptyState icon={<FileText aria-hidden="true" />} title={r.empty} hint={r.emptyHint}>
          <Link href="/app/jobs" className="btn btn-primary btn-lg">{t.nav.jobs}</Link>
        </EmptyState>
      </>
    );
  }

  const kpis = [
    { label: r.kpis.newOffers, value: d.newOffers },
    { label: r.kpis.evaluated, value: d.evaluated },
    { label: r.kpis.applied, value: d.applied },
    { label: r.kpis.responses, value: d.responses },
    { label: r.kpis.interviews, value: d.interviews.length },
  ];
  const iconBtn = "grid size-9 place-items-center rounded-[10px] border border-line bg-surface text-ink hover:bg-surface-2";
  const h2 = "mb-2 mt-5 flex items-center gap-2 text-[1.15rem] tracking-[-0.01em] first:mt-0";

  return (
    <>
      <header className="mb-[18px] flex flex-wrap items-end justify-between gap-4 rise">
        <div className="min-w-0">
          <p className="eyebrow mb-1">{r.title}</p>
          <h1 className="text-[1.75rem] leading-[1.1] tracking-[-0.025em] sm:text-[2rem]">{fmt(r.week, { d: date(d.weekStart) })}</h1>
          <p className="mt-1.5 text-muted tabular">
            {date(d.weekStart)} → {date(d.weekEnd)}
            {isCurrent ? ` · ${r.thisWeek}` : ""}
          </p>
        </div>
        <nav className="flex items-center gap-1.5 no-print" aria-label={r.title}>
          <Link href={`/app/reports?week=${addDays(week, -7)}`} className={iconBtn} aria-label={r.prevWeek}><ChevronLeft size={16} aria-hidden="true" /></Link>
          {isCurrent ? (
            <span className={`${iconBtn} cursor-not-allowed text-line-strong`} aria-disabled="true" aria-label={r.nextWeek}><ChevronRight size={16} aria-hidden="true" /></span>
          ) : (
            <Link href={`/app/reports?week=${addDays(week, 7)}`} className={iconBtn} aria-label={r.nextWeek}><ChevronRight size={16} aria-hidden="true" /></Link>
          )}
          <a href={`/api/reports/html?range=week:${week}`} className="btn btn-outline ml-2 !h-9" target="_blank" rel="noopener"><Printer size={14} aria-hidden="true" /> {t.common.print}</a>
          <a href={`/api/reports/html?range=week:${week}&format=md`} className="btn btn-outline !h-9"><Download size={14} aria-hidden="true" /> .md</a>
        </nav>
      </header>

      <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <article className="card px-6 py-6 leading-relaxed sm:px-8 sm:py-7 rise" style={{ ["--i" as string]: 1 }}>
          <dl className="mb-5 grid grid-cols-3 gap-2 border-b border-line pb-[18px] sm:grid-cols-5">
            {kpis.map((k) => (
              <div key={k.label}>
                <dd className="display tabular text-[1.6rem] leading-none">{k.value}</dd>
                <dt className="mt-1 text-[0.72rem] text-muted">{k.label}</dt>
              </div>
            ))}
          </dl>
          <h2 className={h2}><Lightbulb size={16} className="text-saffron" aria-hidden="true" /> {r.focus}</h2>
          <ol className="flex flex-col gap-1 pl-5 text-[0.92rem] text-ink-2" style={{ listStyle: "decimal" }}>
            {d.focus.map((f) => {
              // Each priority is one click from being done.
              const top = d.top[0];
              const href = { evaluateBacklog: "/app/jobs?evaluate=1", applyTop: top ? (top.application_id ? `/app/pipeline/${top.application_id}?tab=overview` : `/app/jobs/${top.job_id}`) : "/app/jobs", followUp: "/app/pipeline", deadlines: "/app/calendar", prepInterviews: "/app/coach", findOffers: "/app/sources", keepGoing: "/app/jobs" }[f.key];
              return (
                <li key={f.key}>
                  {fmt(r.focusKeys[f.key], f.vars)}{" "}
                  <Link href={href} className="whitespace-nowrap font-semibold text-accent-text hover:underline no-print">{r.focusGo[f.key]} →</Link>
                </li>
              );
            })}
          </ol>
          <PolishFocus week={week} />
          <h2 className={h2}><Trophy size={16} className="text-success" aria-hidden="true" /> {r.top}</h2>
          {d.top.length ? (
            <ul className="flex flex-col gap-2">
              {d.top.map((x) => (
                <li key={x.job_id} className="flex items-center gap-3">
                  <CompanyAvatar name={x.company} size={30} />
                  <div className="min-w-0 flex-1">
                    <Link href={x.application_id ? `/app/pipeline/${x.application_id}` : `/app/jobs/${x.job_id}`} className="block truncate text-[0.9rem] font-semibold hover:text-accent-text">{x.title}</Link>
                    <p className="truncate text-xs text-muted">{x.company}{x.deadline ? ` · ${t.common.deadline} ${date(x.deadline)}` : ""}</p>
                  </div>
                  <ScoreRing value={x.score} size={32} label={scoreLabel(t, x.score)} animate={false} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">{r.noneTop}</p>}
          <h2 className={h2}><BookOpen size={16} className="text-accent-text" aria-hidden="true" /> {r.lessons}</h2>
          {d.lessons.length ? (
            <ul className="flex flex-col gap-1 pl-5 text-[0.92rem] text-ink-2" style={{ listStyle: "disc" }}>
              {d.lessons.map((l) => <li key={l.application_id}>{l.lesson} <span className="text-muted">— {l.company}{l.outcome ? ` · ${o[l.outcome as keyof typeof o]}` : ""}</span></li>)}
            </ul>
          ) : <p className="text-sm text-muted">{r.noneLessons}</p>}
          <h2 className={h2}><CalendarDays size={16} className="text-muted" aria-hidden="true" /> {r.deadlinesNext}</h2>
          {d.deadlinesNext.length || d.interviews.length ? (
            <ul className="flex flex-col gap-1 pl-5 text-[0.92rem] text-ink-2" style={{ listStyle: "disc" }}>
              {d.interviews.map((i, k) => <li key={`i${k}`}>{i.title} — {i.company} <span className="text-muted tabular">· {date(i.starts_at)}</span></li>)}
              {d.deadlinesNext.map((x) => (
                <li key={x.job_id}>
                  <Link href={x.application_id ? `/app/pipeline/${x.application_id}` : `/app/jobs/${x.job_id}`} className="hover:text-accent-text">{x.title}</Link> <span className="text-muted">— {x.company} · <span className="tabular">{date(x.deadline)}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">{r.none}</p>}
        </article>

        <aside className="flex flex-col gap-3">
          <SilentCard t={t} silent={d.silent} i={2} />
          <CalibrationCard t={t} bands={d.calibration.bands} verdict={d.calibration.verdict} n={d.calibration.n} i={3} />
          <section className="card p-4" style={{ ["--i" as string]: 4 }}>
            <h2 className="card-title mb-1.5 text-[0.9rem]">{r.exportHtml}</h2>
            <p className="text-[0.78rem] text-muted">{r.lead}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <a href={`/api/reports/html?range=week:${week}`} className="btn btn-outline btn-sm" target="_blank" rel="noopener"><FileText size={13} aria-hidden="true" /> {r.exportHtml}</a>
              <a href="/api/reports/csv" className="btn btn-outline btn-sm"><Download size={13} aria-hidden="true" /> {r.exportCsv}</a>
            </div>
          </section>
        </aside>
      </div>

      <section className="card mt-[18px] p-[18px] rise" style={{ ["--i" as string]: 7 }} aria-labelledby="hist-h">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="hist-h" className="card-title">{r.history} <span className="chip tabular">{data.apps.length}</span></h2>
          <a href="/api/reports/csv" className="btn btn-ghost btn-sm no-print"><Download size={14} aria-hidden="true" />{r.exportCsv}</a>
        </div>
        <div className="-mx-[18px] overflow-x-auto px-[18px]">
          <table className="table min-w-[860px]">
            <thead>
              <tr>
                <th scope="col">{r.col.offer}</th><th scope="col">{r.col.type}</th><th scope="col">{r.col.status}</th><th scope="col" className="text-right">{r.col.score}</th>
                <th scope="col">{r.col.created}</th><th scope="col">{r.col.applied}</th><th scope="col">{r.col.outcome}</th><th scope="col">{r.col.lesson}</th>
              </tr>
            </thead>
            <tbody>
              {data.apps.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/app/pipeline/${a.id}`} className="block max-w-72 truncate font-medium hover:underline">{a.job.title}</Link><span className="block truncate text-xs text-muted">{a.job.company}</span></td>
                  <td className="text-muted">{t.jobTypes[a.type as JobType] ?? a.type}</td>
                  <td><StateChip state={a.status} t={t} /></td>
                  <td className="text-right tabular">{a.score?.toFixed(1) ?? "—"}</td>
                  <td className="tabular text-muted">{date(a.created_at)}</td>
                  <td className="tabular">{a.applied_at ? date(a.applied_at) : "—"}</td>
                  <td>{a.outcome ? o[a.outcome as keyof typeof o] : "—"}</td>
                  <td className="max-w-64 truncate text-muted" title={a.lesson || undefined}>{a.lesson || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
