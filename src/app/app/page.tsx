import Link from "next/link";
import { redirect } from "next/navigation";
import { AlarmClock, ArrowRight, BellRing, CalendarClock, Check, Hourglass, MessagesSquare, Plus, Sparkles } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getProfile } from "@/lib/db";
import { needsOnboarding } from "@/lib/cv/onboarding";
import { daysBetween, getToday, type FocusItem } from "@/lib/repo/insights";
import { CompanyAvatar, Section, Stat } from "@/components/kit";
import { ScoreRing, VerdictChip, scoreLabel } from "@/components/ui";
import { RunButton } from "@/components/insights/run-button";
import { WeeklyGoal } from "@/components/insights/weekly-goal";
import { evaluatePending, logFollowup, setReminderDoneAction, trackOffer } from "@/app/actions/insights";

const fmtDay = (key: string, locale: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", opts);
};

export default async function TodayPage() {
  const profile = getProfile();
  if (needsOnboarding(profile)) redirect("/app/welcome");
  const { t, locale } = await getDict();
  const m = t.insights2.today;
  const now = new Date();
  const d = getToday(now);
  const hour = now.getHours();
  const hello = hour < 12 ? m.morning : hour < 18 ? m.afternoon : m.evening;
  const first = d.name.trim().split(/\s+/)[0];
  const urgent = d.focus.length;
  const fresh = !(d.setup.profile && d.setup.offers && d.setup.evaluated && d.setup.tracked);
  const W = 7;
  const kpis = [
    { label: m.kpis.offers, value: d.kpis.offers[W], trend: d.kpis.offers },
    { label: m.kpis.evaluated, value: d.kpis.evaluated[W], trend: d.kpis.evaluated },
    { label: m.kpis.applied, value: d.kpis.applied[W], trend: d.kpis.applied },
    { label: m.kpis.interviews, value: d.kpis.interviews[W], trend: d.kpis.interviews },
    { label: m.kpis.fit, value: d.kpis.avgFit ? d.kpis.avgFit.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : "—", trend: d.kpis.fit },
  ];
  const pipeMax = Math.max(1, ...d.pipeline.map((p) => p.n));

  return (
    <>
      <header className="mb-7 rise flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-text mb-1.5">
            {fmtDay(d.today, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <h1 className="text-[1.75rem] sm:text-[2.1rem] leading-tight">
            {hello}
            {first ? `, ${first}` : ""}
          </h1>
          <p className="mt-1.5 text-muted" aria-live="polite">
            {urgent === 0 ? m.statusNone : urgent === 1 ? m.statusOne : fmt(m.statusMany, { n: urgent })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/calendar" className="btn btn-secondary"><CalendarClock size={16} aria-hidden="true" /> {t.insights2.cal.title}</Link>
          <Link href="/app/jobs/new" className="btn btn-primary"><Plus size={16} aria-hidden="true" /> {t.dashboard.quick.add}</Link>
        </div>
      </header>

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label={m.kpiHint}>
        {kpis.map((k, i) => (
          <Stat key={k.label} label={k.label} value={k.value} trend={k.trend} hint={m.kpiHint} i={i + 1} />
        ))}
      </dl>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          {fresh && <GetStarted t={t} setup={d.setup} />}

          <Section id="focus" title={m.focus} i={2}>
            {d.focus.length === 0 ? (
              <p className="text-sm text-muted">{m.focusEmpty}</p>
            ) : (
              <ul className="-my-1 divide-y divide-line">
                {d.focus.map((f) => (
                  <FocusRow key={focusKey(f)} f={f} t={t} locale={locale} today={d.today} />
                ))}
              </ul>
            )}
          </Section>

          <Section
            id="top"
            title={m.topMatches}
            i={3}
            actions={<Link href="/app/jobs" className="btn btn-ghost btn-sm">{m.seeOffers} <ArrowRight size={14} aria-hidden="true" /></Link>}
          >
            {d.topMatches.length === 0 ? (
              <p className="text-sm text-muted">{d.setup.evaluated ? m.allTracked : m.topEmpty}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {d.topMatches.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:border-line-strong">
                    <ScoreRing value={j.evaluation!.global} size={46} label={scoreLabel(t, j.evaluation!.global)} animate={false} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/jobs/${j.id}`} className="block truncate font-medium hover:text-accent-text">{j.title}</Link>
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                        <CompanyAvatar name={j.company} size={16} /> <span className="truncate">{j.company}</span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <VerdictChip verdict={j.evaluation!.verdict} t={t} />
                        <RunButton action={trackOffer.bind(null, j.id)} success={m.tracked} className="btn btn-secondary btn-sm !py-0.5" label={`${m.track}: ${j.title}`}>
                          {m.track}
                        </RunButton>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-6">
          <Section id="goal" title={m.goal} i={4}>
            <WeeklyGoal target={d.goal.target} done={d.goal.done} streak={d.goal.streak} />
          </Section>

          <Section
            id="upcoming"
            title={m.upcoming}
            i={5}
            actions={<Link href="/app/calendar" className="btn btn-ghost btn-sm">{m.openCalendar}</Link>}
          >
            {d.upcoming.length === 0 ? (
              <p className="text-sm text-muted">{m.upcomingEmpty}</p>
            ) : (
              <ul className="space-y-1">
                {d.upcoming.map((u) => (
                  <li key={u.key}>
                    <Link href={u.href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                      <span className="grid w-11 shrink-0 place-items-center rounded-lg bg-surface-2 py-1 text-center leading-tight">
                        <span className="text-[0.65rem] font-semibold uppercase text-muted">{fmtDay(u.day, locale, { month: "short" })}</span>
                        <span className="display tabular text-lg">{Number(u.day.slice(8))}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{u.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {t.insights2.cal.kinds[u.kind]}
                          {u.time && ` · ${u.time}`}
                          {u.sub && ` · ${u.sub}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            id="pipe"
            title={m.pipeline}
            i={6}
            actions={<Link href="/app/pipeline" className="btn btn-ghost btn-sm">{m.openPipeline}</Link>}
          >
            <ol className="space-y-1.5">
              {d.pipeline.map((p) => (
                <li key={p.stage}>
                  <Link href="/app/pipeline" className="-mx-2 grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 rounded-lg px-2 py-1 text-sm hover:bg-surface-2">
                    <span className="truncate text-ink-2">{t.states[p.stage]}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${(p.n / pipeMax) * 100}%`, opacity: p.n ? 0.85 : 0 }} />
                    </span>
                    <span className="mono text-right tabular">{p.n}</span>
                  </Link>
                </li>
              ))}
            </ol>
            {d.closed > 0 && <p className="mt-3 text-xs text-muted">{fmt(m.closed, { n: d.closed })}</p>}
          </Section>
        </div>
      </div>
    </>
  );
}

type T = Awaited<ReturnType<typeof getDict>>["t"];

const focusKey = (f: FocusItem) =>
  f.kind === "reminder" || f.kind === "interview" ? `${f.kind}${f.id}` : f.kind === "deadline" ? `d${f.jobId}` : f.kind === "waiting" ? `w${f.appId}` : "u";

function FocusRow({ f, t, locale, today }: { f: FocusItem; t: T; locale: string; today: string }) {
  const m = t.insights2.today;
  const icon = {
    reminder: <BellRing size={16} aria-hidden="true" />,
    interview: <MessagesSquare size={16} aria-hidden="true" />,
    deadline: <AlarmClock size={16} aria-hidden="true" />,
    waiting: <Hourglass size={16} aria-hidden="true" />,
    unevaluated: <Sparkles size={16} aria-hidden="true" />,
  }[f.kind];
  const tone =
    f.kind === "reminder" && f.overdue ? "bg-danger-soft text-danger" : f.kind === "interview" ? "bg-saffron-soft text-saffron" : f.kind === "deadline" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-text";

  let title: React.ReactNode, meta: string, action: React.ReactNode;
  switch (f.kind) {
    case "reminder":
      title = f.href ? <Link href={f.href} className="hover:text-accent-text">{f.title}</Link> : f.title;
      meta = [f.overdue ? `${m.overdue} · ${fmtDay(f.day, locale, { day: "numeric", month: "short" })}` : m.dueToday, f.sub].filter(Boolean).join(" · ");
      action = <RunButton action={setReminderDoneAction.bind(null, f.id, true)} success={t.insights2.cal.doneToast}><Check size={14} aria-hidden="true" /> {m.markDone}</RunButton>;
      break;
    case "interview":
      title = <Link href={f.href} className="hover:text-accent-text">{f.title}</Link>;
      meta = [f.day === today ? m.interviewToday : m.interviewTomorrow, f.time, f.sub].filter(Boolean).join(" · ");
      action = <Link href={f.href} className="btn btn-saffron btn-sm">{m.prepare}</Link>;
      break;
    case "deadline": {
      const n = daysBetween(today, f.day);
      title = <Link href={f.href} className="hover:text-accent-text">{f.title}</Link>;
      meta = [n === 0 ? m.deadlineToday : fmt(m.deadlineIn, { n }), f.sub, `${f.score.toFixed(1)}/5`].join(" · ");
      action = <RunButton action={trackOffer.bind(null, f.jobId)} success={m.tracked} className="btn btn-primary btn-sm">{m.track}</RunButton>;
      break;
    }
    case "waiting":
      title = <Link href={f.href} className="hover:text-accent-text">{f.title}</Link>;
      meta = `${fmt(m.waiting, { n: f.days })} · ${f.sub}`;
      action = <RunButton action={logFollowup.bind(null, f.appId)} success={m.followupLogged} successBody={m.followupBody}>{m.logFollowup}</RunButton>;
      break;
    case "unevaluated":
      title = fmt(m.unevaluated, { n: f.count });
      meta = "";
      action = (
        <span className="flex gap-1.5">
          <RunButton action={evaluatePending} success={m.evaluated.replace("{n}", "{r}")} pendingLabel={m.evaluating} className="btn btn-primary btn-sm">
            {fmt(m.evaluateN, { n: Math.min(5, f.count) })}
          </RunButton>
          <Link href="/app/jobs" className="btn btn-ghost btn-sm">{m.seeOffers}</Link>
        </span>
      );
      break;
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        {meta && <p className="truncate text-xs text-muted">{meta}</p>}
      </div>
      <div className="ml-12 shrink-0 sm:ml-0">{action}</div>
    </li>
  );
}

function GetStarted({ t, setup }: { t: T; setup: Record<"profile" | "offers" | "evaluated" | "tracked", boolean> }) {
  const m = t.insights2.today;
  const steps = [
    { k: "profile" as const, href: "/app/profile" },
    { k: "offers" as const, href: "/app/sources" },
    { k: "evaluated" as const, href: "/app/jobs" },
    { k: "tracked" as const, href: "/app/pipeline" },
  ];
  const next = steps.find((s) => !setup[s.k])?.k;
  return (
    <section className="card relative overflow-hidden p-5 rise" style={{ ["--i" as string]: 1 }} aria-labelledby="start-h">
      <div className="pattern pattern-fade" aria-hidden="true" />
      <div className="relative">
        <h2 id="start-h" className="text-xl">{m.getStarted}</h2>
        <p className="text-sm text-muted">{m.getStartedLead}</p>
        <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {steps.map((s, i) => {
            const done = setup[s.k];
            const st = m.steps[s.k];
            return (
              <li key={s.k} className={`rounded-xl border p-3.5 ${s.k === next ? "border-accent bg-accent-soft/40" : "border-line bg-surface"}`}>
                <div className="flex items-start gap-3">
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${done ? "bg-success text-[var(--surface)]" : s.k === next ? "bg-accent text-[var(--accent-ink)]" : "bg-surface-3 text-ink-2"}`}
                  >
                    {done ? <Check size={14} aria-label={m.stepDone} /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={`font-medium ${done ? "text-muted line-through" : ""}`}>{st.t}</p>
                    <p className="mt-0.5 text-xs text-muted">{st.d}</p>
                    {!done && (
                      <Link href={s.href} className={`btn btn-sm mt-2.5 ${s.k === next ? "btn-primary" : "btn-secondary"}`}>
                        {st.cta} <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
