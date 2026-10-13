import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MapPin, Wifi, Sparkles, Archive, Trash2, Pencil } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { getJob, withMeta } from "@/lib/db";
import { EngineChip, PageHeader, ScoreRing, StateChip, VerdictChip, fmtDate, scoreLabel } from "@/components/ui";
import { ScoreBreakdown } from "@/components/score-breakdown";
import { ActionButton } from "@/components/action-button";
import { removeJob, runEvaluation, setArchived, trackJob } from "@/app/actions/jobs";

export default async function JobPage({ params }: PageProps<"/app/jobs/[id]">) {
  const { id } = await params;
  const base = getJob(Number(id));
  if (!base) notFound();
  const job = withMeta(base);
  const { t, locale } = await getDict();
  const ev = job.evaluation;
  const isHttp = /^https?:/.test(job.url);

  return (
    <>
      <Link href="/app/jobs" className="btn btn-ghost btn-sm -ml-3 mb-4 no-print">
        <ArrowLeft size={16} aria-hidden="true" /> {t.jobs.title}
      </Link>
      <PageHeader
        title={job.title}
        lead={job.company}
        actions={
          <>
            {isHttp && (
              <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                <ExternalLink size={16} aria-hidden="true" /> {t.common.open}
              </a>
            )}
            <Link href={`/app/jobs/${job.id}/edit`} className="btn btn-secondary">
              <Pencil size={16} aria-hidden="true" /> {t.common.edit}
            </Link>
            {job.application ? (
              <Link href={`/app/pipeline/${job.application.id}`} className="btn btn-primary">
                {t.jobs.goToApplication}
              </Link>
            ) : (
              <ActionButton action={trackJob.bind(null, job.id)} className="btn btn-primary">
                {t.jobs.track}
              </ActionButton>
            )}
          </>
        }
      />

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <article className="card p-6 rise" style={{ ["--i" as string]: 1 }}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted mb-5">
            <span className="chip">{t.jobTypes[job.type]}</span>
            {job.location && <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden="true" />{job.location}</span>}
            {job.remote && <span className="inline-flex items-center gap-1"><Wifi size={14} aria-hidden="true" />{t.common.remote}</span>}
            <span>{t.common.posted}: {fmtDate(job.posted_at ?? job.created_at, locale)}</span>
            <span>{t.common.deadline}: {job.deadline ? fmtDate(job.deadline, locale) : t.common.noDeadline}</span>
            {job.application && <StateChip state={job.application.status} t={t} />}
          </div>
          <h2 className="text-xl mb-3">{t.jobs.description}</h2>
          <div className="whitespace-pre-wrap leading-relaxed text-[0.95rem] text-ink-2">{job.description || "—"}</div>
          {job.tags.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Tags">
              {job.tags.map((tag) => (
                <li key={tag} className="chip mono">{tag}</li>
              ))}
            </ul>
          )}
        </article>

        <aside className="space-y-4">
          <section className="card p-5 rise" style={{ ["--i" as string]: 2 }} aria-labelledby="eval-h">
            <div className="flex items-start justify-between gap-3">
              <h2 id="eval-h" className="text-xl">{t.jobs.evaluation}</h2>
              {ev && <ScoreRing value={ev.global} size={64} label={scoreLabel(t, ev.global)} />}
            </div>
            {ev ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <VerdictChip verdict={ev.verdict} t={t} />
                  <EngineChip engine={ev.engine} t={t} />
                </div>
                <div className="mt-5">
                  <ScoreBreakdown ev={ev} t={t} />
                </div>
                {ev.summary && <p className="mt-5 text-sm leading-relaxed text-ink-2">{ev.summary}</p>}
                <Lists title={t.jobs.strengths} items={ev.strengths} tone="success" />
                <Lists title={t.jobs.gaps} items={ev.gaps} tone="amber" />
                <Lists title={t.jobs.flags} items={ev.flags} tone="danger" />
                <p className="mt-4 text-xs text-muted">
                  {t.jobs.scoredBy} {ev.engine} {t.jobs.on} {fmtDate(ev.created_at, locale)}
                </p>
                <ActionButton action={runEvaluation.bind(null, job.id)} pendingLabel={t.jobs.evaluating} className="btn btn-secondary mt-4 w-full">
                  <Sparkles size={16} aria-hidden="true" /> {t.jobs.reevaluate}
                </ActionButton>
              </>
            ) : (
              <>
                <p className="hint mt-2">{t.jobs.notEvaluated}</p>
                <ActionButton action={runEvaluation.bind(null, job.id)} pendingLabel={t.jobs.evaluating} className="btn btn-primary mt-4 w-full">
                  <Sparkles size={16} aria-hidden="true" /> {t.jobs.evaluate}
                </ActionButton>
              </>
            )}
          </section>

          <div className="flex gap-2 no-print rise" style={{ ["--i" as string]: 3 }}>
            <ActionButton action={setArchived.bind(null, job.id, !job.archived)} className="btn btn-ghost btn-sm">
              <Archive size={14} aria-hidden="true" /> {job.archived ? t.common.unarchive : t.common.archive}
            </ActionButton>
            <ActionButton action={removeJob.bind(null, job.id)} confirm={t.common.confirmDelete} className="btn btn-danger btn-sm">
              <Trash2 size={14} aria-hidden="true" /> {t.common.delete}
            </ActionButton>
          </div>
        </aside>
      </div>
    </>
  );
}

function Lists({ title, items, tone }: { title: string; items: string[]; tone: "success" | "amber" | "danger" }) {
  if (!items.length) return null;
  const dot = tone === "success" ? "var(--success)" : tone === "amber" ? "var(--saffron)" : "var(--danger)";
  return (
    <div className="mt-4">
      <h3 className="text-xs uppercase tracking-wide font-semibold text-muted mb-1.5">{title}</h3>
      <ul className="space-y-1 text-sm">
        {items.map((s) => (
          <li key={s} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 size-1.5 rounded-full shrink-0" style={{ background: dot }} />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
