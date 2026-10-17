import Link from "next/link";
import { redirect } from "next/navigation";
import { AlarmClock, ArrowRight, BellRing, Bookmark, Check, Hourglass, MessageSquareReply, Mic, Play, Snowflake, Sparkles, Zap } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getProfile } from "@/lib/db";
import { needsOnboarding } from "@/lib/cv/onboarding";
import { daysBetween, getToday, type FocusItem } from "@/lib/repo/insights";
import { CompanyAvatar, Sparkline } from "@/components/kit";
import { ScoreRing, VerdictChip, scoreLabel } from "@/components/ui";
import { RunButton } from "@/components/insights/run-button";
import { WeeklyGoal } from "@/components/insights/weekly-goal";
import { evaluatePending, logFollowup, setReminderDoneAction, trackOffer } from "@/app/actions/insights";
import type { AppState } from "@/lib/types";

const fmtDay = (key: string, locale: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", opts);
};

const STAGE_COLOR: Record<AppState, string> = {
  evaluated: "var(--line-strong)",
  applied: "var(--accent)",
  responded: "var(--accent-text)",
  interview: "var(--saffron)",
  offer: "var(--success)",
  hired: "var(--success)",
  rejected: "var(--danger)",
  discarded: "var(--muted)",
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
  const pipeTotal = d.pipeline.reduce((s, p) => s + p.n, 0);
  const untracked = d.topMatches.slice(0, 3);

  return (
    <>
      <header className="mb-7 flex flex-wrap items-center justify-between gap-6 rise">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5 text-[0.78rem]">{fmtDay(d.today, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1 className="text-[2rem] leading-[1.1] tracking-[-0.025em] sm:text-[2.4rem]">
            {hello}
            {first ? `, ${first}` : ""}.
          </h1>
          <p className="mt-2 text-[1.05rem] text-ink-2" aria-live="polite">
            {urgent === 0 ? m.statusNone : urgent === 1 ? m.statusOne : fmt(m.statusMany, { n: urgent })}
          </p>
        </div>
        <WeeklyGoal target={d.goal.target} done={d.goal.done} streak={d.goal.streak} />
      </header>

      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="next-h" className="min-w-0">
          {fresh && <GetStarted t={t} setup={d.setup} />}

          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="next-h" className="text-[1.25rem] tracking-[-0.015em]">{m.upNext}</h2>
            <span className="text-[0.8rem] text-muted">{d.focus.length === 1 ? m.rankedOne : fmt(m.ranked, { n: d.focus.length })}</span>
          </div>
          {d.focus.length === 0 ? (
            <p className="card p-5 text-sm text-muted">{m.focusEmpty}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {d.focus.map((f, i) => (
                <FocusCard key={focusKey(f)} f={f} t={t} locale={locale} today={d.today} i={i} />
              ))}
            </ol>
          )}

          <div className="mb-3 mt-7 flex items-baseline justify-between">
            <h2 className="text-[1.25rem] tracking-[-0.015em]">{m.bestMatches}</h2>
            <Link href="/app/jobs" className="text-[0.8rem] font-semibold">{m.allOffers}</Link>
          </div>
          {untracked.length === 0 ? (
            <p className="card p-5 text-sm text-muted">{d.setup.evaluated ? m.allTracked : m.topEmpty}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {untracked.map((j, i) => (
                <li key={j.id} className="card lift flex flex-col gap-2.5 p-3.5 rise" style={{ ["--i" as string]: i + 2 }}>
                  <div className="flex items-center gap-2.5">
                    <CompanyAvatar name={j.company} size={32} />
                    <span className="min-w-0 flex-1 truncate text-[0.78rem] text-muted">
                      {j.company} · {t.jobTypes[j.type]}
                    </span>
                    <ScoreRing value={j.evaluation!.global} size={34} label={scoreLabel(t, j.evaluation!.global)} animate={false} />
                  </div>
                  <Link href={`/app/jobs/${j.id}`} className="line-clamp-2 text-[0.9rem] font-semibold leading-[1.3] text-ink hover:text-accent-text">
                    {j.title}
                  </Link>
                  <div className="mt-auto flex items-center justify-between">
                    <VerdictChip verdict={j.evaluation!.verdict} t={t} />
                    <RunButton action={trackOffer.bind(null, j.id)} success={m.tracked} className="btn btn-outline btn-sm !h-7 !min-h-7 !px-2.5 !text-[0.78rem]" label={`${m.track}: ${j.title}`}>
                      <Bookmark size={12} aria-hidden="true" /> {m.track}
                    </RunButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right rail: the week at a glance */}
        <aside className="flex min-w-0 flex-col gap-4">
          <section className="card p-[18px] rise" style={{ ["--i" as string]: 2 }} aria-labelledby="week-h">
            <h2 id="week-h" className="card-title mb-3">{m.thisWeek}</h2>
            {d.upcoming.length === 0 ? (
              <p className="text-sm text-muted">{m.upcomingEmpty}</p>
            ) : (
              <ol className="relative flex flex-col gap-3.5">
                <span aria-hidden="true" className="absolute bottom-2.5 left-[19px] top-2.5 w-px bg-line" />
                {d.upcoming.map((u) => (
                  <li key={u.key} className="relative grid grid-cols-[40px_1fr] items-center gap-3">
                    <span className="relative z-[1] grid size-10 place-items-center rounded-[10px] border border-line bg-surface-2 text-center leading-none">
                      <span className="display text-base">{Number(u.day.slice(8))}</span>
                      <span className="text-[0.6rem] font-semibold uppercase text-muted">{fmtDay(u.day, locale, { month: "short" })}</span>
                    </span>
                    <Link href={u.href} className="min-w-0 text-ink">
                      <span className="block truncate text-sm font-medium">{u.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {t.insights2.cal.kinds[u.kind]}
                        {u.time && ` · ${u.time}`}
                        {u.sub && ` · ${u.sub}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="card p-[18px] rise" style={{ ["--i" as string]: 3 }} aria-labelledby="pipe-h">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="pipe-h" className="card-title">{m.pipeline}</h2>
              <Link href="/app/pipeline" className="text-[0.78rem] font-semibold">{m.openBoard}</Link>
            </div>
            {pipeTotal === 0 ? (
              <p className="text-sm text-muted">{m.noPipeline}</p>
            ) : (
              <>
                <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                  {d.pipeline.map((p) => (
                    <span key={p.stage} style={{ flex: p.n || 0.0001, background: STAGE_COLOR[p.stage], transition: "flex .6s cubic-bezier(.2,.7,.2,1)" }} />
                  ))}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {d.pipeline.map((p) => (
                    <li key={p.stage} className="flex items-center gap-2 text-[0.8rem]">
                      <span className="size-2 rounded-[2px]" style={{ background: STAGE_COLOR[p.stage] }} />
                      <span className="flex-1 truncate text-ink-2">{t.states[p.stage]}</span>
                      <span className="mono text-[0.75rem]">{p.n}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {d.closed > 0 && <p className="mt-3 text-[0.78rem] text-muted">{fmt(m.closed, { n: d.closed })}</p>}
          </section>

          <section className="card p-[18px] rise" style={{ ["--i" as string]: 4 }} aria-labelledby="kpi-h">
            <h2 id="kpi-h" className="card-title mb-2.5">{m.last8}</h2>
            <dl className="grid grid-cols-2 gap-3">
              {kpis.map((k) => (
                <div key={k.label} className="flex items-center justify-between gap-2 border-t border-line pt-2">
                  <div className="min-w-0">
                    <dt className="truncate text-[0.72rem] text-muted">{k.label}</dt>
                    <dd className="display tabular text-[1.25rem] leading-[1.1]">{k.value}</dd>
                  </div>
                  <Sparkline values={k.trend} width={56} height={20} />
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

type T = Awaited<ReturnType<typeof getDict>>["t"];

const focusKey = (f: FocusItem) =>
  f.kind === "reminder" || f.kind === "interview" ? `${f.kind}${f.id}` : f.kind === "deadline" ? `d${f.jobId}` : f.kind === "waiting" ? `w${f.appId}` : f.kind === "cadence" ? `c${f.appId}` : "u";

function FocusCard({ f, t, locale, today, i }: { f: FocusItem; t: T; locale: string; today: string; i: number }) {
  const m = t.insights2.today;
  const icon = {
    reminder: <BellRing size={20} aria-hidden="true" />,
    interview: <Mic size={20} aria-hidden="true" />,
    deadline: <AlarmClock size={20} aria-hidden="true" />,
    waiting: <Hourglass size={20} aria-hidden="true" />,
    cadence: f.kind === "cadence" && f.urgency === "cold" ? <Snowflake size={20} aria-hidden="true" /> : f.kind === "cadence" && f.urgency === "urgent" ? <Zap size={20} aria-hidden="true" /> : <MessageSquareReply size={20} aria-hidden="true" />,
    unevaluated: <Sparkles size={20} aria-hidden="true" />,
  }[f.kind];
  const tone =
    (f.kind === "reminder" && f.overdue) || (f.kind === "cadence" && f.urgency === "urgent") || f.kind === "deadline"
      ? "danger"
      : f.kind === "interview" || (f.kind === "cadence" && f.urgency === "overdue")
        ? "saffron"
        : f.kind === "cadence" && f.urgency === "cold"
          ? "muted"
          : "accent";
  const eyebrowColor = { danger: "text-danger", saffron: "text-saffron", accent: "text-accent-text", muted: "text-muted" }[tone];

  let eyebrow: string, title: React.ReactNode, meta: React.ReactNode, action: React.ReactNode;
  switch (f.kind) {
    case "reminder":
      eyebrow = f.overdue ? `${m.overdue} · ${fmtDay(f.day, locale, { day: "numeric", month: "short" })}` : m.dueToday;
      title = f.href ? <Link href={f.href} className="hover:text-accent-text">{f.title}</Link> : f.title;
      meta = f.sub;
      action = (
        <RunButton action={setReminderDoneAction.bind(null, f.id, true)} success={t.insights2.cal.doneToast} className="btn btn-primary btn-sm !h-9">
          <Check size={14} aria-hidden="true" /> {m.markDone}
        </RunButton>
      );
      break;
    case "interview":
      eyebrow = `${f.day === today ? m.interviewToday : m.interviewTomorrow} · ${f.time}`;
      title = <Link href={f.href} className="hover:text-accent-text">{f.title}</Link>;
      meta = f.sub;
      action = (
        <>
          <Link href={`/app/coach?application=${f.href.split("/").pop()}`} className="btn btn-saffron !h-[38px]">
            <Play size={15} aria-hidden="true" /> {m.startMock}
          </Link>
          <Link href={`${f.href}?tab=interviews`} className="btn btn-outline btn-sm !h-[34px]">{m.openPrep}</Link>
        </>
      );
      break;
    case "deadline": {
      const n = daysBetween(today, f.day);
      eyebrow = n === 0 ? m.deadlineToday : fmt(m.deadlineIn, { n });
      title = <Link href={f.href} className="hover:text-accent-text">{f.title}</Link>;
      meta = (
        <span className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-2">
            <ScoreRing value={f.score} size={40} label={scoreLabel(t, f.score)} animate={false} />
          </span>
          <span>{f.sub}</span>
        </span>
      );
      action = (
        <>
          <RunButton action={trackOffer.bind(null, f.jobId)} success={m.tracked} className="btn btn-primary !h-9">{m.track}</RunButton>
          <Link href={f.href} className="btn btn-outline !h-9">{m.openOffer}</Link>
        </>
      );
      break;
    }
    case "waiting":
      eyebrow = fmt(m.waiting, { n: f.days });
      title = <Link href={f.href} className="hover:text-accent-text">{f.title}</Link>;
      meta = f.sub;
      action = <RunButton action={logFollowup.bind(null, f.appId)} success={m.followupLogged} successBody={m.followupBody} className="btn btn-primary btn-sm !h-9">{m.logFollowup}</RunButton>;
      break;
    case "cadence": {
      const c = t.apps2.cadence;
      eyebrow = f.urgency === "cold" ? m.cold : f.angle === "thankyou" ? m.replyDue : m.followupDue;
      const head = f.urgency === "cold" ? fmt(c.todayCold, { company: f.company }) : f.urgency === "urgent" ? fmt(c.todayUrgent, { company: f.company }) : f.angle === "thankyou" ? fmt(c.todayThanks, { company: f.company }) : fmt(c.todayTitle, { company: f.company });
      title = <Link href={f.href} className="hover:text-accent-text">{head}</Link>;
      meta = [f.title, fmt(m.waiting, { n: f.days }), f.followups ? fmt(c.sent, { n: f.followups }) : ""].filter(Boolean).join(" · ");
      action =
        f.urgency === "cold" ? (
          <Link href={f.href} className="btn btn-outline !h-9">{m.openApp}</Link>
        ) : (
          <>
            <Link href={f.href} className={`btn !h-9 ${f.urgency === "urgent" ? "btn-primary" : "btn-saffron"}`}>{c.angle[f.angle] || m.openApp}</Link>
            <RunButton action={logFollowup.bind(null, f.appId)} success={m.followupLogged} successBody={m.followupBody} className="btn btn-outline btn-sm !h-[34px]">{m.logFollowup}</RunButton>
          </>
        );
      break;
    }
    case "unevaluated":
      eyebrow = "";
      title = fmt(m.unevaluated, { n: f.count });
      meta = m.aboutSeconds;
      action = (
        <RunButton action={evaluatePending} success={m.evaluated.replace("{n}", "{r}")} pendingLabel={m.evaluating} className="btn btn-saffron !h-9">
          <Sparkles size={14} aria-hidden="true" /> {fmt(m.evaluateN, { n: Math.min(5, f.count) })}
        </RunButton>
      );
      break;
  }

  const dashed = f.kind === "unevaluated";
  return (
    <li
      className={`grid grid-cols-[auto_1fr] items-start gap-4 rounded-[14px] border bg-surface px-5 py-4 sm:grid-cols-[auto_1fr_auto] ${dashed ? "border-dashed border-line-strong" : "border-line card-shadow"}`}
      style={{ animation: `rise .5s cubic-bezier(.2,.7,.2,1) ${i * 60}ms both` }}
    >
      <span className={`tile tone-${tone}`}>{icon}</span>
      <div className="min-w-0">
        {eyebrow && <p className={`eyebrow ${eyebrowColor}`}>{eyebrow}</p>}
        <h3 className={`mt-1 text-[1.05rem] leading-snug tracking-[-0.01em] ${f.kind === "interview" ? "text-[1.15rem]" : ""}`}>{title}</h3>
        {meta && <div className="mt-0.5 text-sm text-muted">{meta}</div>}
      </div>
      <div className="col-start-2 flex flex-wrap items-stretch gap-1.5 sm:col-start-3 sm:flex-col">{action}</div>
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
    <section className="card relative mb-6 overflow-hidden p-5 rise" aria-labelledby="start-h">
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
                    className={`mono grid size-[26px] shrink-0 place-items-center rounded-full text-[0.72rem] font-bold ${done ? "bg-success text-[var(--surface)]" : s.k === next ? "bg-accent text-[var(--accent-ink)]" : "bg-surface-3 text-ink-2"}`}
                  >
                    {done ? <Check size={13} aria-label={m.stepDone} /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${done ? "text-muted line-through" : ""}`}>{st.t}</p>
                    <p className="mt-0.5 text-xs text-muted">{st.d}</p>
                    {!done && (
                      <Link href={s.href} className={`btn btn-sm mt-2.5 ${s.k === next ? "btn-primary" : "btn-outline"}`}>
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
