import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Download, FileText, Lightbulb, Star } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { loadReportsData, weeklyDigest } from "@/lib/reports/repo";
import { addDays, localDate, weekStart } from "@/lib/reports/digest";
import { CompanyAvatar, EmptyState, PageHeader, Stat } from "@/components/kit";
import { ScoreRing, StateChip, fmtDate, scoreLabel } from "@/components/ui";
import { PolishFocus } from "@/components/reports/polish";
import type { JobType } from "@/lib/types";

export const metadata: Metadata = { title: "Reports" };

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
        <EmptyState icon={<FileText size={22} aria-hidden="true" />} title={r.empty} hint={r.emptyHint}>
          <Link href="/app/jobs" className="btn btn-primary">{t.nav.jobs}</Link>
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
  const h2 = "flex items-center gap-2 text-base font-semibold";
  const h2s = { fontFamily: "var(--font-sans)", letterSpacing: 0 } as const;

  return (
    <>
      <PageHeader eyebrow={r.eyebrow} title={r.title} lead={r.lead}
        actions={
          <>
            <a href={`/api/reports/html?range=week:${week}`} className="btn btn-secondary" target="_blank" rel="noopener"><FileText size={16} aria-hidden="true" />{r.exportHtml}</a>
            <a href={`/api/reports/html?range=week:${week}&format=md`} className="btn btn-ghost"><Download size={16} aria-hidden="true" />{r.exportMd}</a>
            <a href="/api/reports/csv" className="btn btn-ghost"><Download size={16} aria-hidden="true" />{r.exportCsv}</a>
          </>
        } />

      <nav aria-label={r.week.replace("{d}", "")} className="mb-6 flex items-center justify-between gap-3 no-print">
        <Link href={`/app/reports?week=${addDays(week, -7)}`} className="btn btn-secondary btn-sm" aria-label={r.prevWeek}><ChevronLeft size={16} aria-hidden="true" /><span className="hidden sm:inline">{r.prevWeek}</span></Link>
        <p className="text-center">
          <span className="display text-lg">{fmt(r.week, { d: date(d.weekStart) })}</span>
          <span className="block text-xs text-muted tabular">{date(d.weekStart)} → {date(d.weekEnd)}{isCurrent ? ` · ${r.thisWeek}` : ""}</span>
        </p>
        <div className="flex gap-1.5">
          {!isCurrent && <Link href="/app/reports" className="btn btn-ghost btn-sm">{r.thisWeek}</Link>}
          <Link href={`/app/reports?week=${addDays(week, 7)}`} className="btn btn-secondary btn-sm" aria-label={r.nextWeek} aria-disabled={isCurrent || undefined} tabIndex={isCurrent ? -1 : undefined}><span className="hidden sm:inline">{r.nextWeek}</span><ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
      </nav>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k, i) => <Stat key={k.label} label={k.label} value={k.value} i={i} />)}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="card p-5 rise" style={{ ["--i" as string]: 1 }} aria-labelledby="focus-h">
          <h2 id="focus-h" className={h2} style={h2s}><Lightbulb size={16} className="text-saffron" aria-hidden="true" />{r.focus}</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {d.focus.map((f, i) => (
              <li key={f.key} className="flex gap-3"><span className="mono text-muted tabular">{String(i + 1).padStart(2, "0")}</span><span>{fmt(r.focusKeys[f.key], f.vars)}</span></li>
            ))}
          </ol>
          <PolishFocus week={week} />
        </section>

        <section className="card p-5 rise" style={{ ["--i" as string]: 2 }} aria-labelledby="top-h">
          <h2 id="top-h" className={h2} style={h2s}><Star size={16} className="text-saffron" aria-hidden="true" />{r.top}</h2>
          <p className="text-xs text-muted">{r.topHint}</p>
          {d.top.length ? (
            <ul className="mt-3 divide-y divide-line">
              {d.top.map((x) => (
                <li key={x.job_id} className="flex items-center gap-3 py-2.5">
                  <CompanyAvatar name={x.company} size={32} />
                  <div className="min-w-0 flex-1">
                    <Link href={x.application_id ? `/app/apply/${x.application_id}` : `/app/jobs/${x.job_id}`} className="block truncate text-sm font-medium hover:underline">{x.title}</Link>
                    <p className="truncate text-xs text-muted">{x.company}{x.deadline ? ` · ${t.common.deadline} ${date(x.deadline)}` : ""}</p>
                  </div>
                  <ScoreRing value={x.score} size={36} label={scoreLabel(t, x.score)} animate={false} />
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">{r.noneTop}</p>}
        </section>

        <section className="card p-5 rise" style={{ ["--i" as string]: 3 }} aria-labelledby="dl-h">
          <h2 id="dl-h" className={h2} style={h2s}><CalendarClock size={16} aria-hidden="true" />{r.deadlinesNext}</h2>
          {d.deadlinesNext.length ? (
            <ul className="mt-3 divide-y divide-line text-sm">
              {d.deadlinesNext.map((x) => (
                <li key={x.job_id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={x.application_id ? `/app/apply/${x.application_id}` : `/app/jobs/${x.job_id}`} className="min-w-0 truncate hover:underline">{x.title} <span className="text-muted">— {x.company}</span></Link>
                  <span className="chip chip-saffron tabular shrink-0">{date(x.deadline)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">{r.none}</p>}
          {d.interviews.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold" style={h2s}>{r.kpis.interviews}</h3>
              <ul className="mt-2 divide-y divide-line text-sm">
                {d.interviews.map((i, k) => <li key={k} className="flex justify-between gap-3 py-2"><span className="truncate">{i.title} — {i.company}</span><span className="text-muted tabular shrink-0">{date(i.starts_at)}</span></li>)}
              </ul>
            </>
          )}
        </section>

        <section className="card p-5 rise" style={{ ["--i" as string]: 4 }} aria-labelledby="les-h">
          <h2 id="les-h" className={h2} style={h2s}>{r.lessons}</h2>
          {d.lessons.length ? (
            <ul className="mt-3 space-y-3 text-sm">
              {d.lessons.map((l) => (
                <li key={l.application_id} className="rounded-xl bg-surface-2 p-3">
                  <p className="text-xs text-muted">{l.title} — {l.company}{l.outcome ? ` · ${o[l.outcome as keyof typeof o]}` : ""}</p>
                  <p className="mt-1">{l.lesson}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">{r.noneLessons}</p>}
        </section>
      </div>

      <section className="card mt-6 p-5 rise" style={{ ["--i" as string]: 5 }} aria-labelledby="hist-h">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="hist-h" className={h2} style={h2s}>{r.history} <span className="chip tabular">{data.apps.length}</span></h2>
          <a href="/api/reports/csv" className="btn btn-ghost btn-sm no-print"><Download size={14} aria-hidden="true" />{r.exportCsv}</a>
        </div>
        <div className="-mx-5 overflow-x-auto px-5">
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
                  <td><Link href={`/app/apply/${a.id}`} className="block max-w-72 truncate font-medium hover:underline">{a.job.title}</Link><span className="block truncate text-xs text-muted">{a.job.company}</span></td>
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
