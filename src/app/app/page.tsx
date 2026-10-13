import Link from "next/link";
import { ArrowRight, Plus, Rss, UserRound } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { getProfile, listApplications, listJobs, stats } from "@/lib/db";
import { getEngine } from "@/lib/ai";
import { APP_STATES } from "@/lib/types";
import { ScoreRing, StateChip, VerdictChip, daysUntil, fmtDate, scoreLabel } from "@/components/ui";

export default async function Dashboard() {
  const { t, locale } = await getDict();
  const profile = getProfile();
  const s = stats();
  const engine = await getEngine(profile.settings);
  const apps = listApplications();
  const jobs = listJobs();
  const setupNeeded = profile.cv_md.trim().length < 50;

  const actions = [
    ...apps
      .filter((a) => a.next_action_at && (daysUntil(a.next_action_at) ?? 99) <= 7)
      .map((a) => ({ key: `n${a.id}`, href: `/app/pipeline/${a.id}`, title: a.job.title, sub: a.job.company, when: a.next_action_at!, kind: t.application.nextAction })),
    ...jobs
      .filter((j) => j.deadline && !j.application && (daysUntil(j.deadline) ?? 99) <= 10 && (daysUntil(j.deadline) ?? -1) >= 0)
      .map((j) => ({ key: `d${j.id}`, href: `/app/jobs/${j.id}`, title: j.title, sub: j.company, when: j.deadline!, kind: t.common.deadline })),
  ].sort((a, b) => a.when.localeCompare(b.when)).slice(0, 6);

  const recent = jobs.filter((j) => j.evaluation).sort((a, b) => b.evaluation!.created_at.localeCompare(a.evaluation!.created_at)).slice(0, 5);
  const funnel = APP_STATES.filter((st) => !["discarded", "rejected"].includes(st)).map((st) => ({ st, n: s.byStatus[st] ?? 0 }));
  const max = Math.max(1, ...funnel.map((f) => f.n));
  const kpis = [
    [t.dashboard.kpis.jobs, s.jobs],
    [t.dashboard.kpis.evaluated, s.evaluated],
    [t.dashboard.kpis.applied, apps.filter((a) => !["evaluated", "discarded"].includes(a.status)).length],
    [t.dashboard.kpis.interviews, (s.byStatus.interview ?? 0) + (s.byStatus.offer ?? 0) + (s.byStatus.hired ?? 0)],
    [t.dashboard.kpis.avg, s.avgScore ? s.avgScore.toFixed(1) : "—"],
  ] as const;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8 rise">
        <div>
          <p className="text-sm text-muted">{t.dashboard.greeting}{profile.name ? `, ${profile.name.split(" ")[0]}` : ""} · {fmtDate(new Date().toISOString(), locale)}</p>
          <h1 className="text-3xl sm:text-4xl mt-1">{t.dashboard.title}</h1>
        </div>
        <Link href="/app/settings" className={`chip ${engine.online ? "chip-accent" : "chip-saffron"}`}>
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: engine.online ? "var(--accent)" : "var(--saffron)" }} />
          {engine.online ? `${t.dashboard.ollama.ok} · ${engine.label.replace("ollama:", "")}` : t.dashboard.ollama.off}
        </Link>
      </div>

      {setupNeeded && (
        <div className="card p-6 mb-6 grid sm:grid-cols-[1fr_auto] gap-4 items-center rise border-accent/40" style={{ ["--i" as string]: 1 }}>
          <div>
            <h2 className="text-2xl">{t.dashboard.setupTitle}</h2>
            <p className="text-ink-2 mt-1">{t.dashboard.setupText}</p>
          </div>
          <Link href="/app/profile" className="btn btn-primary">{t.dashboard.setupCta} <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {kpis.map(([label, v], i) => (
          <div key={label} className="card p-4 rise" style={{ ["--i" as string]: i + 1 }}>
            <dt className="text-xs uppercase tracking-wide font-semibold text-muted">{label}</dt>
            <dd className="display text-4xl mt-1 tabular">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
        <section className="card p-5 rise" style={{ ["--i" as string]: 3 }} aria-labelledby="funnel-h">
          <h2 id="funnel-h" className="text-xl mb-4">{t.dashboard.funnel}</h2>
          <ol className="space-y-2">
            {funnel.map(({ st, n }) => (
              <li key={st} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="text-ink-2 truncate">{t.states[st]}</span>
                <span className="h-6 rounded-md bg-surface-2 overflow-hidden">
                  <span className="block h-full rounded-md bg-accent/80" style={{ width: `${(n / max) * 100}%`, transition: "width .6s" }} />
                </span>
                <span className="mono text-right">{n}</span>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/app/jobs/new" className="btn btn-secondary btn-sm"><Plus size={14} aria-hidden="true" /> {t.dashboard.quick.add}</Link>
            <Link href="/app/sources" className="btn btn-secondary btn-sm"><Rss size={14} aria-hidden="true" /> {t.dashboard.quick.scan}</Link>
            <Link href="/app/profile" className="btn btn-secondary btn-sm"><UserRound size={14} aria-hidden="true" /> {t.dashboard.quick.profile}</Link>
          </div>
        </section>

        <section className="card p-5 rise" style={{ ["--i" as string]: 4 }} aria-labelledby="next-h">
          <h2 id="next-h" className="text-xl mb-4">{t.dashboard.nextActions}</h2>
          {actions.length === 0 ? (
            <p className="text-muted text-sm">{t.dashboard.noActions}</p>
          ) : (
            <ul className="divide-y divide-line">
              {actions.map((a) => {
                const d = daysUntil(a.when) ?? 0;
                return (
                  <li key={a.key}>
                    <Link href={a.href} className="flex items-center gap-3 py-2.5 group">
                      <span className={`mono text-xs w-14 shrink-0 ${d <= 2 ? "text-danger" : "text-muted"}`}>{d <= 0 ? t.common.today : `J+${d}`}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate group-hover:text-accent">{a.title}</span>
                        <span className="block text-xs text-muted truncate">{a.sub} · {a.kind}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-5 lg:col-span-2 rise" style={{ ["--i" as string]: 5 }} aria-labelledby="recent-h">
          <h2 id="recent-h" className="text-xl mb-4">{t.dashboard.recent}</h2>
          {recent.length === 0 ? (
            <p className="text-muted text-sm">{t.dashboard.noRecent}</p>
          ) : (
            <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {recent.map((j) => (
                <li key={j.id}>
                  <Link href={`/app/jobs/${j.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-line-strong transition-colors">
                    <ScoreRing value={j.evaluation!.global} size={44} label={scoreLabel(t, j.evaluation!.global)} animate={false} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs uppercase tracking-wide font-semibold text-muted truncate">{j.company}</span>
                      <span className="block truncate">{j.title}</span>
                      <span className="mt-1 flex gap-1.5">
                        <VerdictChip verdict={j.evaluation!.verdict} t={t} />
                        {j.application && <StateChip state={j.application.status} t={t} />}
                      </span>
                    </span>
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
