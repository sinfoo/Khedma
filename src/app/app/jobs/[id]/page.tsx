import type { Metadata } from "next";
import Link from "next/link";
import { PostingLink } from "@/components/posting-link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bookmark, Copy, FileText, Pencil, Send, Sparkles } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { getJob, getProfile, listJobs, withMeta } from "@/lib/db";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { eligibilityGates, type Gate } from "@/lib/ai/gates";
import { getTriageMarginals, latestEvaluationV2 } from "@/lib/repo/evaluations";
import { EvaluationV2 } from "@/components/offers/evaluation-v2";
import type { Evaluation, Locale } from "@/lib/types";
import { CompanyAvatar } from "@/components/kit";
import { EngineChip, ScoreRing, StateChip, VerdictChip, daysUntil, fmtDate, scoreLabel } from "@/components/ui";
import { ScoreBreakdown } from "@/components/score-breakdown";
import { ActionButton } from "@/components/action-button";
import { FormattedDescription } from "@/components/offers/description";
import { AskOffer } from "@/components/offers/ask-offer";
import { CopyButton, NewOfferPrompt, OfferMenu, StarToggle } from "@/components/offers/offer-actions";
import { applyTo, runEvaluation, tailorCvFor } from "@/app/actions/jobs";
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
  const dup = findDuplicates(listJobs({ archived: job.archived })).get(job.id);
  const d = daysUntil(job.deadline);
  const cv = cvForMatching();
  const ats = atsKeywords(job, cv.text);
  const href = (k: Tab) => (k === "overview" ? `/app/jobs/${job.id}` : `/app/jobs/${job.id}?tab=${k}`);

  const tabBtn = (k: Tab, label: string) => (
    <Link
      key={k}
      href={href(k)}
      aria-current={tab === k ? "page" : undefined}
      className={`h-9 border-b-2 px-3 text-[0.85rem] font-semibold leading-9 transition-colors ${tab === k ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <Link href="/app/jobs" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink no-print">
        <ArrowLeft size={15} aria-hidden="true" /> {o.back}
      </Link>

      {sp.new === "1" && !ev && <NewOfferPrompt id={job.id} />}

      <header className="mb-4 rise">
        <div className="flex items-start gap-3.5">
          <CompanyAvatar name={job.company} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-[0.8rem] font-semibold text-ink-2">
              {job.company} · {t.jobTypes[job.type]}
              {job.location ? ` · ${job.location}` : ""}
              {job.remote ? ` · ${o.remote}` : ""}
            </p>
            <h1 className="mt-0.5 text-[1.45rem] leading-[1.2] tracking-[-0.02em] sm:text-[1.6rem]">{job.title}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[0.8rem] text-muted">
              <span>{job.posted_at ? o.posted : o.added} {fmtDate(job.posted_at ?? job.created_at, locale)}</span>
              <span className={d !== null && d >= 0 && d <= 3 ? "font-semibold text-danger" : d !== null && d >= 0 && d <= 7 ? "font-semibold text-saffron" : ""}>
                {job.deadline ? `${t.common.deadline} ${fmtDate(job.deadline, locale)}${d !== null && d >= 0 ? ` · ${d === 0 ? o.dToday : fmt(o.dMinus, { n: d })}` : d !== null ? ` · ${o.expired}` : ""}` : o.noDeadline}
              </span>
              <span>{o.list2.via} {job.source}</span>
              {job.application && <StateChip state={job.application.status} t={t} />}
              {job.archived && <span className="chip">{o.archived}</span>}
              {dup && (
                <Link href={`/app/jobs/${dup.id}`} className="chip chip-saffron hover:underline">
                  <Copy size={12} aria-hidden="true" /> {fmt(o.dupOf, { title: dup.title })}
                </Link>
              )}
            </p>
          </div>
          {ev && <ScoreRing value={ev.global} size={56} label={scoreLabel(t, ev.global)} />}
        </div>

        {d !== null && d < 0 && (
          <p role="note" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[0.82rem] text-danger no-print">{fmt(o.expiredWarn, { date: fmtDate(job.deadline!, locale) })}</p>
        )}
        <div className="mt-3.5 flex flex-wrap items-center gap-2 no-print">
          {job.application?.applied_at ? (
            <Link href={`/app/pipeline/${job.application.id}`} className="btn btn-primary !h-9">
              <Bookmark size={14} aria-hidden="true" /> {o.openApplication}
            </Link>
          ) : job.application ? (
            <Link href={`/app/pipeline/${job.application.id}?tab=overview`} className="btn btn-primary !h-9">
              <Send size={14} aria-hidden="true" /> {o.apply}
            </Link>
          ) : (
            <ActionButton action={applyTo.bind(null, job.id)} className="btn btn-primary !h-9">
              <Send size={14} aria-hidden="true" /> {o.apply}
            </ActionButton>
          )}
          {!ev && (
            <ActionButton action={runEvaluation.bind(null, job.id)} pendingLabel={o.evaluating} className="btn btn-saffron !h-9">
              <Sparkles size={14} aria-hidden="true" /> {o.scoreIt}
            </ActionButton>
          )}
          {!job.application?.applied_at && (
            <ActionButton action={tailorCvFor.bind(null, job.id)} className="btn btn-outline !h-9">
              <FileText size={14} aria-hidden="true" /> {o.tailorCv}
            </ActionButton>
          )}
          <PostingLink job={job} size="md" variant="secondary" />
          <span className="ml-auto flex items-center gap-1.5">
            <Link href={`/app/jobs/${job.id}/edit`} className="btn btn-outline btn-icon !h-9 !w-9" aria-label={o.edit} title={o.edit}>
              <Pencil size={15} aria-hidden="true" />
            </Link>
            <StarToggle id={job.id} starred={job.starred} />
            <OfferMenu id={job.id} archived={job.archived} />
          </span>
        </div>

        <nav aria-label={o.tabsLabel} className="mt-3 flex gap-1 border-b border-line no-print">
          {tabBtn("overview", o.tabs.overview)}
          {tabBtn("fit", o.tabs.fit)}
          {tabBtn("keywords", ats.keywords.length && !cv.empty ? `${o.tabs.keywords} · ${ats.pct}%` : o.tabs.keywords)}
          {tabBtn("ask", o.tabs.ask)}
        </nav>
      </header>

      {tab === "overview" && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <article className="card p-6 rise" aria-labelledby="desc-h" style={{ ["--i" as string]: 1 }}>
            <h2 id="desc-h" className="sr-only">{o.description}</h2>
            {job.description.trim() ? <FormattedDescription text={job.description} /> : <p className="text-muted">{o.noDescription}</p>}
          </article>
          <aside className="space-y-3.5">
            <section className="card p-4 rise" style={{ ["--i" as string]: 2 }} aria-labelledby="fit-mini-h">
              <h2 id="fit-mini-h" className="card-title text-[0.9rem]">{o.fitScore}</h2>
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
                  <ActionButton action={runEvaluation.bind(null, job.id)} pendingLabel={o.evaluating} className="btn btn-saffron btn-sm mt-3 w-full">
                    <Sparkles size={14} aria-hidden="true" /> {o.scoreIt}
                  </ActionButton>
                </>
              )}
            </section>
            {job.tags.length > 0 && (
              <section className="card p-4 rise" style={{ ["--i" as string]: 3 }} aria-labelledby="tags-h">
                <h2 id="tags-h" className="card-title text-[0.9rem]">{o.tags}</h2>
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

      {tab === "fit" && (
        <FitTab
          jobId={job.id}
          ev={latestEvaluationV2(job.id)}
          appId={job.application?.id ?? null}
          marginals={getTriageMarginals()}
          gates={eligibilityGates(job, getProfile(), getProfileExtra().langs)}
          t={t}
          locale={locale}
        />
      )}

      {tab === "keywords" && (
        <section aria-labelledby="kw-h" className="flex flex-col gap-3.5 rise">
          <h2 id="kw-h" className="sr-only">{o.kw.title}</h2>
          {cv.empty ? (
            <div className="card border-dashed !border-line-strong p-7 text-center">
              <p className="text-ink-2">{o.kw.noCv}</p>
              <Link href="/app/profile" className="btn btn-primary btn-sm mt-3">{o.kw.addCv}</Link>
            </div>
          ) : !ats.keywords.length ? (
            <p className="card p-5 text-muted">{o.kw.none}</p>
          ) : (
            <KeywordReport ats={ats} t={t} fileName={cv.fileName} appId={job.application?.id ?? null} jobId={job.id} />
          )}
        </section>
      )}

      {tab === "ask" && <AskOffer id={job.id} />}
    </>
  );
}

function KeywordReport({ ats, t, fileName, appId, jobId }: { ats: ReturnType<typeof atsKeywords>; t: Dict; fileName: string | null | undefined; appId: number | null; jobId: number }) {
  const o = t.offers2;
  const present = ats.keywords.filter((k) => k.inCv);
  const missing = ats.keywords.filter((k) => !k.inCv);
  const tone = ats.pct >= 70 ? "var(--success)" : ats.pct >= 40 ? "var(--saffron)" : "var(--danger)";
  return (
    <>
      <section className="card p-[18px]">
        <div className="flex items-end gap-3">
          <span className="display tabular text-[2.4rem] leading-none">{ats.pct}%</span>
          <div className="flex-1 pb-1.5">
            <p className="text-[0.85rem] font-semibold">{o.kw.match}</p>
            <p className="mt-0.5 text-[0.75rem] text-muted">
              {fileName ? fmt(o.kw.fromFile, { name: fileName }) : o.kw.fromMd} · {fmt(o.kw.pct, { p: ats.pct, n: ats.keywords.length })}
            </p>
          </div>
        </div>
        <div className="bar mt-3 !h-2">
          <span style={{ width: `${ats.pct}%`, background: tone, transition: "width 1s cubic-bezier(.2,.7,.2,1)" }} />
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="card p-4">
          <h3 className="card-title mb-2.5 flex items-center gap-1.5 text-[0.8rem]">
            <span aria-hidden="true" className="size-2 rounded-full bg-success" /> {o.kw.present} · {present.length}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {present.length ? present.map((k) => <span key={k.term} className="chip chip-success">{k.term}</span>) : <p className="text-sm text-muted">—</p>}
          </div>
        </section>
        <section className="card p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="card-title flex items-center gap-1.5 text-[0.8rem]">
              <span aria-hidden="true" className="size-2 rounded-full bg-danger" /> {o.kw.missing} · {missing.length}
            </h3>
            {missing.length > 0 && <CopyButton text={missing.map((k) => k.term).join(", ")} label={o.kw.copy} done={o.kw.copied} />}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missing.length ? missing.map((k) => <span key={k.term} className="chip">{k.term}</span>) : <p className="text-sm text-success">{o.kw.allFound}</p>}
          </div>
          {missing.length > 0 && <p className="mt-2.5 text-[0.75rem] text-muted">{o.kw.honest}</p>}
        </section>
      </div>
      {missing.length > 0 &&
        (appId ? (
          <Link href={`/app/pipeline/${appId}?tab=documents`} className="btn btn-saffron self-start !h-9">
            <Sparkles size={14} aria-hidden="true" /> {o.kw.tailorGap}
          </Link>
        ) : (
          <ActionButton action={tailorCvFor.bind(null, jobId)} className="btn btn-saffron self-start !h-9">
            <Sparkles size={14} aria-hidden="true" /> {o.kw.tailorGap}
          </ActionButton>
        ))}
    </>
  );
}

function FitTab({ jobId, ev, appId, marginals, gates, t, locale }: { jobId: number; ev: Evaluation | null; appId: number | null; marginals: boolean; gates: Gate[]; t: Dict; locale: Locale }) {
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
        <EvaluationV2 ev={ev} jobId={jobId} appId={appId} marginals={marginals} gates={gates} />
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
