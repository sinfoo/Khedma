import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bookmark, Copy, ExternalLink, FileText, MapPin, Pencil, Sparkles, Wifi } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { getJob, listJobs, withMeta } from "@/lib/db";
import type { Evaluation, Locale } from "@/lib/types";
import { CompanyAvatar, LinkTabs, Progress } from "@/components/kit";
import { EngineChip, ScoreRing, StateChip, VerdictChip, daysUntil, fmtDate, scoreLabel } from "@/components/ui";
import { ScoreBreakdown } from "@/components/score-breakdown";
import { ActionButton } from "@/components/action-button";
import { FormattedDescription } from "@/components/offers/description";
import { AskOffer } from "@/components/offers/ask-offer";
import { CopyButton, NewOfferPrompt, OfferMenu, StarToggle } from "@/components/offers/offer-actions";
import { runEvaluation, tailorCvFor, trackJob } from "@/app/actions/jobs";
import { cvForMatching, findDuplicates, listEvaluationHistory } from "@/lib/repo/offers";
import { atsKeywords } from "@/lib/ai/offers";

const TABS = ["overview", "fit", "keywords", "ask"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: PageProps<"/app/jobs/[id]">): Promise<Metadata> {
  const job = getJob(Number((await params).id));
  return { title: job ? `${job.title} · ${job.company}` : "Offer" };
}

export default async function JobPage({ params, searchParams }: PageProps<"/app/jobs/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const base = /^\d+$/.test(id) ? getJob(Number(id)) : null;
  if (!base) notFound();
  const job = withMeta(base);
  const { t, locale } = await getDict();
  const o = t.offers2;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const ev = job.evaluation;
  const isHttp = /^https?:/.test(job.url);
  const dup = findDuplicates(listJobs({ archived: job.archived })).get(job.id);
  const d = daysUntil(job.deadline);
  const cv = cvForMatching();
  const ats = atsKeywords(job, cv.text);
  const href = (k: Tab) => (k === "overview" ? `/app/jobs/${job.id}` : `/app/jobs/${job.id}?tab=${k}`);

  return (
    <>
      <Link href="/app/jobs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink no-print">
        <ArrowLeft size={15} aria-hidden="true" /> {o.back}
      </Link>

      {sp.new === "1" && !ev && <NewOfferPrompt id={job.id} />}

      <header className="mb-6 rise">
        <div className="flex flex-wrap items-start gap-4">
          <CompanyAvatar name={job.company} size={56} />
          <div className="min-w-0 flex-1 basis-72">
            <p className="text-sm font-semibold text-ink-2">{job.company}</p>
            <h1 className="text-[1.6rem] leading-tight sm:text-[2rem]">{job.title}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-sm text-muted">
              <span className="chip">{t.jobTypes[job.type]}</span>
              {job.location && <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden="true" />{job.location}</span>}
              {job.remote && <span className="inline-flex items-center gap-1 text-accent-text"><Wifi size={14} aria-hidden="true" />{o.remote}</span>}
              <span>{job.posted_at ? o.posted : o.added} {fmtDate(job.posted_at ?? job.created_at, locale)}</span>
              <span className={d !== null && d >= 0 && d <= 3 ? "font-semibold text-danger" : d !== null && d >= 0 && d <= 7 ? "text-saffron" : ""}>
                {job.deadline ? `${t.common.deadline} ${fmtDate(job.deadline, locale)}${d !== null && d >= 0 ? ` · ${d === 0 ? o.dToday : fmt(o.dMinus, { n: d })}` : d !== null ? ` · ${o.expired}` : ""}` : o.noDeadline}
              </span>
              {job.application && <StateChip state={job.application.status} t={t} />}
              {job.archived && <span className="chip">{o.archived}</span>}
              {dup && (
                <Link href={`/app/jobs/${dup.id}`} className="chip chip-saffron hover:underline">
                  <Copy size={12} aria-hidden="true" /> {fmt(o.dupOf, { title: dup.title })}
                </Link>
              )}
            </div>
          </div>
          {ev && (
            <div className="hidden items-center gap-3 sm:flex">
              <ScoreRing value={ev.global} size={64} label={scoreLabel(t, ev.global)} />
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 no-print">
          {job.application ? (
            <Link href={`/app/pipeline/${job.application.id}`} className="btn btn-primary">
              <Bookmark size={16} aria-hidden="true" /> {o.openApplication}
            </Link>
          ) : (
            <ActionButton action={trackJob.bind(null, job.id)} className="btn btn-primary">
              <Bookmark size={16} aria-hidden="true" /> {t.jobs.track}
            </ActionButton>
          )}
          <ActionButton action={tailorCvFor.bind(null, job.id)} className="btn btn-secondary">
            <FileText size={16} aria-hidden="true" className="text-accent-text" /> {o.tailorCv}
          </ActionButton>
          <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-line sm:block" />
          {isHttp && (
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              <ExternalLink size={16} aria-hidden="true" /> {o.openPosting}
            </a>
          )}
          <Link href={`/app/jobs/${job.id}/edit`} className="btn btn-ghost">
            <Pencil size={16} aria-hidden="true" /> {o.edit}
          </Link>
          <StarToggle id={job.id} starred={job.starred} />
          <OfferMenu id={job.id} archived={job.archived} />
        </div>
      </header>

      <LinkTabs
        label={o.tabsLabel}
        current={tab}
        tabs={[
          { key: "overview", href: href("overview"), label: o.tabs.overview },
          { key: "fit", href: href("fit"), label: ev ? `${o.tabs.fit} · ${ev.global.toFixed(1)}` : o.tabs.fit },
          { key: "keywords", href: href("keywords"), label: ats.keywords.length && !cv.empty ? `${o.tabs.keywords} · ${ats.pct}%` : o.tabs.keywords },
          { key: "ask", href: href("ask"), label: o.tabs.ask },
        ]}
      />

      {tab === "overview" && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="card p-6 rise" aria-labelledby="desc-h" style={{ ["--i" as string]: 1 }}>
            <h2 id="desc-h" className="sr-only">{o.description}</h2>
            {job.description.trim() ? <FormattedDescription text={job.description} /> : <p className="text-muted">{o.noDescription}</p>}
          </article>
          <aside className="space-y-4">
            <section className="card p-5 rise" style={{ ["--i" as string]: 2 }} aria-labelledby="fit-mini-h">
              <h2 id="fit-mini-h" className="text-xs font-semibold uppercase tracking-wide text-muted">{o.fitScore}</h2>
              {ev ? (
                <Link href={href("fit")} className="mt-3 flex items-center gap-3 rounded-lg hover:text-accent-text">
                  <ScoreRing value={ev.global} size={52} label={scoreLabel(t, ev.global)} animate={false} />
                  <span className="space-y-1">
                    <VerdictChip verdict={ev.verdict} t={t} />
                    <span className="block text-xs text-muted">{fmtDate(ev.created_at, locale)}</span>
                  </span>
                </Link>
              ) : (
                <>
                  <p className="mt-2 text-sm text-muted">{o.notEvaluatedHint}</p>
                  <ActionButton action={runEvaluation.bind(null, job.id)} pendingLabel={o.evaluating} className="btn btn-primary btn-sm mt-3 w-full">
                    <Sparkles size={14} aria-hidden="true" /> {o.evaluate}
                  </ActionButton>
                </>
              )}
            </section>
            <section className="card relative overflow-hidden p-5 rise" style={{ ["--i" as string]: 3 }} aria-labelledby="tailor-h">
              <div className="pattern pattern-fade" aria-hidden="true" />
              <h2 id="tailor-h" className="relative text-base font-semibold" style={{ fontFamily: "var(--font-sans)" }}>{o.tailorCv}</h2>
              <p className="relative mt-1 text-sm text-muted">{o.tailorHint}</p>
              <ActionButton action={tailorCvFor.bind(null, job.id)} className="btn btn-secondary btn-sm relative mt-3 w-full">
                <FileText size={14} aria-hidden="true" /> {o.tailorCv}
              </ActionButton>
            </section>
            {job.tags.length > 0 && (
              <section className="card p-5 rise" style={{ ["--i" as string]: 4 }} aria-labelledby="tags-h">
                <h2 id="tags-h" className="text-xs font-semibold uppercase tracking-wide text-muted">{o.tags}</h2>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {job.tags.map((tag) => (
                    <li key={tag}>
                      <Link href={`/app/jobs?q=${encodeURIComponent(tag)}`} className="chip mono hover:border-line-strong">{tag}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}

      {tab === "fit" && <FitTab jobId={job.id} ev={ev} t={t} locale={locale} />}

      {tab === "keywords" && (
        <section className="card p-6 rise" aria-labelledby="kw-h">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h2 id="kw-h" className="text-xl">{o.kw.title}</h2>
              <p className="mt-1 text-sm text-muted">{o.kw.intro}</p>
            </div>
            <span className="chip">
              <FileText size={12} aria-hidden="true" /> {cv.fileName ? fmt(o.kw.fromFile, { name: cv.fileName }) : o.kw.fromMd}
            </span>
          </div>
          {cv.empty ? (
            <div className="mt-6 rounded-xl border border-dashed border-line-strong p-6 text-center">
              <p className="text-ink-2">{o.kw.noCv}</p>
              <Link href="/app/profile" className="btn btn-primary btn-sm mt-3">{o.kw.addCv}</Link>
            </div>
          ) : !ats.keywords.length ? (
            <p className="mt-6 text-muted">{o.kw.none}</p>
          ) : (
            <KeywordReport ats={ats} t={t} />
          )}
        </section>
      )}

      {tab === "ask" && <AskOffer id={job.id} />}
    </>
  );
}

function KeywordReport({ ats, t }: { ats: ReturnType<typeof atsKeywords>; t: Dict }) {
  const o = t.offers2;
  const present = ats.keywords.filter((k) => k.inCv);
  const missing = ats.keywords.filter((k) => !k.inCv);
  const tone = ats.pct >= 70 ? "success" : ats.pct >= 40 ? "saffron" : "danger";
  const chipList = (items: typeof present, cls: string) => (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {items.map((k) => (
        <li key={k.term} className={`chip ${cls}`}>
          {k.term}
          <span className="text-[0.7rem] opacity-70">· {k.kind === "skill" ? o.kw.skill : o.kw.term}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <div className="mt-6 max-w-xl">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold">{o.kw.match}</span>
          <span className="display text-3xl tabular">{ats.pct}%</span>
        </div>
        <Progress value={ats.pct} label={o.kw.match} tone={tone} />
        <p className="mt-1.5 text-xs text-muted">{fmt(o.kw.pct, { p: ats.pct, n: ats.keywords.length })}</p>
      </div>
      <div className="mt-7 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ fontFamily: "var(--font-sans)" }}>
            <span aria-hidden="true" className="size-2 rounded-full bg-[var(--success)]" /> {o.kw.present} <span className="text-muted tabular">({present.length})</span>
          </h3>
          {present.length ? chipList(present, "chip-success") : <p className="mt-3 text-sm text-muted">—</p>}
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ fontFamily: "var(--font-sans)" }}>
              <span aria-hidden="true" className="size-2 rounded-full bg-[var(--danger)]" /> {o.kw.missing} <span className="text-muted tabular">({missing.length})</span>
            </h3>
            {missing.length > 0 && <CopyButton text={missing.map((k) => k.term).join(", ")} label={o.kw.copy} done={o.kw.copied} />}
          </div>
          {missing.length ? chipList(missing, "chip-danger") : <p className="mt-3 text-sm text-success">{o.kw.allFound}</p>}
          {missing.length > 0 && <p className="hint mt-3">{o.kw.honest}</p>}
        </div>
      </div>
    </>
  );
}

function FitTab({ jobId, ev, t, locale }: { jobId: number; ev: Evaluation | null; t: Dict; locale: Locale }) {
  const o = t.offers2;
  if (!ev)
    return (
      <section className="card relative overflow-hidden px-6 py-12 text-center rise">
        <div className="pattern pattern-fade" aria-hidden="true" />
        <div className="relative mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-text">
          <Sparkles size={22} aria-hidden="true" />
        </div>
        <h2 className="relative text-xl">{o.notEvaluatedTitle}</h2>
        <p className="relative mx-auto mt-2 max-w-md text-muted">{o.notEvaluatedHint}</p>
        <ActionButton action={runEvaluation.bind(null, jobId)} pendingLabel={o.evaluating} className="btn btn-primary relative mt-6">
          <Sparkles size={16} aria-hidden="true" /> {o.evaluate}
        </ActionButton>
      </section>
    );

  const history = listEvaluationHistory(jobId);
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <section className="card p-6 rise" aria-labelledby="fit-h">
          <h2 id="fit-h" className="sr-only">{o.fitScore}</h2>
          <div className="flex flex-wrap items-center gap-6">
            <ScoreRing value={ev.global} size={120} label={scoreLabel(t, ev.global)} />
            <div className="min-w-0 flex-1 basis-60">
              <div className="flex flex-wrap items-center gap-2">
                <VerdictChip verdict={ev.verdict} t={t} />
                <EngineChip engine={ev.engine} t={t} />
              </div>
              {ev.summary && <p className="mt-3 leading-relaxed text-ink-2">{ev.summary}</p>}
              <p className="mt-3 text-xs text-muted">{t.jobs.scoredBy} {ev.engine === "heuristic" ? t.common.heuristic : ev.engine} · {fmtDate(ev.created_at, locale)}</p>
            </div>
          </div>
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted" style={{ fontFamily: "var(--font-sans)" }}>{o.breakdown}</h3>
            <ScoreBreakdown ev={ev} t={t} />
          </div>
          <ActionButton action={runEvaluation.bind(null, jobId)} pendingLabel={o.evaluating} className="btn btn-secondary mt-6 no-print">
            <Sparkles size={16} aria-hidden="true" /> {o.reevaluate}
          </ActionButton>
        </section>
        <div className="grid gap-4 md:grid-cols-3">
          <Points title={o.strengths} items={ev.strengths} color="var(--success)" i={1} />
          <Points title={o.gaps} items={ev.gaps} color="var(--saffron)" i={2} />
          <Points title={o.flags} items={ev.flags} color="var(--danger)" i={3} />
        </div>
      </div>
      <section className="card p-5 rise" style={{ ["--i" as string]: 2 }} aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)" }}>{o.history}</h2>
        {history.length <= 1 ? (
          <p className="mt-2 text-sm text-muted">{o.historyEmpty}</p>
        ) : (
          <ol className="mt-3 divide-y divide-line">
            {history.map((h, i) => {
              const prev = history[i + 1];
              const delta = prev ? Math.round((h.global - prev.global) * 10) / 10 : null;
              return (
                <li key={h.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="mono w-9 font-semibold">{h.global.toFixed(1)}</span>
                  <span className={`mono w-12 text-xs ${delta === null || delta === 0 ? "text-muted" : delta > 0 ? "text-success" : "text-danger"}`}>
                    {delta === null ? "" : delta > 0 ? `+${delta.toFixed(1)}` : delta === 0 ? "±0" : delta.toFixed(1)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {fmtDate(h.created_at, locale)} · {h.engine === "heuristic" ? t.common.heuristic : h.engine.replace("ollama:", "")}
                  </span>
                  {i === 0 && <span className="chip chip-accent">{o.latest}</span>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function Points({ title, items, color, i }: { title: string; items: string[]; color: string; i: number }) {
  return (
    <section className="card p-5 rise" style={{ ["--i" as string]: i }}>
      <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ fontFamily: "var(--font-sans)" }}>
        <span aria-hidden="true" className="size-2 rounded-full" style={{ background: color }} /> {title}
      </h3>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm text-ink-2">
          {items.map((s) => (
            <li key={s} className="leading-snug">{s}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">—</p>
      )}
    </section>
  );
}
