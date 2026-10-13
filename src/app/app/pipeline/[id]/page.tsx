import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Sparkles } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { getApplication, getJob, getProfile, latestEvaluation, listEvents } from "@/lib/db";
import { APP_STATES } from "@/lib/types";
import { EngineChip, PageHeader, ScoreRing, StateChip, VerdictChip, fmtDate, scoreLabel } from "@/components/ui";
import { ScoreBreakdown } from "@/components/score-breakdown";
import { DocEditor } from "@/components/doc-editor";
import { SaveButton } from "@/components/save-button";
import { ActionButton } from "@/components/action-button";
import { addNote, generateCv, generateLetter, generatePrep, saveApplicationMeta, saveDoc } from "@/app/actions/applications";

const TABS = ["overview", "cv", "letter", "interview", "timeline"] as const;
type Tab = (typeof TABS)[number];

export default async function ApplicationPage({ params, searchParams }: PageProps<"/app/pipeline/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const app = getApplication(Number(id));
  const job = app && getJob(app.job_id);
  if (!app || !job) notFound();
  const { t, locale } = await getDict();
  const ev = latestEvaluation(job.id);
  const profile = getProfile();
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const needProfile = profile.cv_md.trim().length < 50 ? t.application.needProfile : undefined;
  const events = listEvents(app.id);

  return (
    <>
      <Link href="/app/pipeline" className="btn btn-ghost btn-sm -ml-3 mb-4 no-print">
        <ArrowLeft size={16} aria-hidden="true" /> {t.pipeline.title}
      </Link>
      <PageHeader
        title={job.title}
        lead={job.company}
        actions={
          <>
            <StateChip state={app.status} t={t} />
            <Link href={`/app/jobs/${job.id}`} className="btn btn-secondary">
              <ExternalLink size={16} aria-hidden="true" /> {t.application.openOffer}
            </Link>
          </>
        }
      />

      <nav aria-label={t.application.title} className="mb-6 no-print rise" style={{ ["--i" as string]: 1 }}>
        <ul className="flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map((k) => (
            <li key={k}>
              <Link
                href={`/app/pipeline/${app.id}?tab=${k}`}
                aria-current={tab === k ? "page" : undefined}
                className={`block px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  tab === k ? "border-accent text-accent-text" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t.application.tabs[k]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "overview" && (
        <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
          <form action={saveApplicationMeta.bind(null, app.id)} className="card p-5 space-y-4 rise" style={{ ["--i" as string]: 2 }}>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="status">{t.application.status}</label>
                <select id="status" name="status" className="input" defaultValue={app.status}>
                  {APP_STATES.map((s) => (
                    <option key={s} value={s}>{t.states[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="next_action_at">{t.application.nextAction}</label>
                <input id="next_action_at" name="next_action_at" type="date" className="input" defaultValue={app.next_action_at ?? ""} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="notes">{t.application.notes}</label>
              <textarea id="notes" name="notes" className="input !min-h-40" defaultValue={app.notes} placeholder={t.application.notesPlaceholder} />
            </div>
            <div className="flex justify-end">
              <SaveButton label={t.common.save} savedLabel={t.common.saved} />
            </div>
          </form>

          <aside className="card p-5 rise" style={{ ["--i" as string]: 3 }}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl">{t.jobs.evaluation}</h2>
              {ev && <ScoreRing value={ev.global} size={64} label={scoreLabel(t, ev.global)} />}
            </div>
            {ev ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <VerdictChip verdict={ev.verdict} t={t} />
                  <EngineChip engine={ev.engine} t={t} />
                </div>
                <div className="mt-5"><ScoreBreakdown ev={ev} t={t} /></div>
                {ev.summary && <p className="mt-4 text-sm text-ink-2 leading-relaxed">{ev.summary}</p>}
              </>
            ) : (
              <p className="hint mt-2">{t.jobs.notEvaluated}</p>
            )}
          </aside>
        </div>
      )}

      {tab === "cv" && (
        <DocEditor
          value={app.cv_md}
          saveAction={async (md) => { "use server"; await saveDoc(app.id, "cv", md); }}
          generateAction={async () => { "use server"; await generateCv(app.id); }}
          emptyText={t.application.noCv}
          generateLabel={t.application.tailorCv}
          generateHint={t.application.tailorHint}
          disabledReason={needProfile}
        />
      )}

      {tab === "letter" && (
        <DocEditor
          value={app.cover_letter_md}
          saveAction={async (md) => { "use server"; await saveDoc(app.id, "letter", md); }}
          generateAction={async () => { "use server"; await generateLetter(app.id); }}
          emptyText={t.application.noLetter}
          generateLabel={t.application.letter}
          generateHint={t.application.letterHint}
          disabledReason={needProfile}
        />
      )}

      {tab === "interview" && (
        <section className="space-y-4">
          <div className="card p-5 flex flex-wrap items-center gap-3 no-print rise" style={{ ["--i" as string]: 1 }}>
            <ActionButton action={generatePrep.bind(null, app.id)} pendingLabel={t.common.generating} className="btn btn-primary">
              <Sparkles size={16} aria-hidden="true" /> {app.interview_prep ? t.common.regenerate : t.application.prep}
            </ActionButton>
            <p className="text-sm text-muted">{t.application.prepHint}</p>
            {app.interview_prep && <span className="ml-auto"><EngineChip engine={app.interview_prep.engine} t={t} /></span>}
          </div>
          {app.interview_prep ? (
            <InterviewView prep={app.interview_prep} t={t} />
          ) : (
            <p className="text-muted px-1">{t.application.noPrep}</p>
          )}
        </section>
      )}

      {tab === "timeline" && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
          <ol className="card p-5 space-y-4 rise" style={{ ["--i" as string]: 1 }}>
            {events.map((e) => (
              <li key={e.id} className="grid grid-cols-[auto_1fr] gap-3">
                <span aria-hidden="true" className="mt-1.5 size-2.5 rounded-full" style={{ background: e.kind === "status" ? "var(--accent)" : e.kind === "doc" ? "var(--saffron)" : "var(--line-strong)" }} />
                <div>
                  <p className="text-sm">
                    {e.kind === "status" ? `${t.application.changed} ${t.states[e.payload as keyof typeof t.states] ?? e.payload}` : e.kind === "doc" ? `${t.common.generate}: ${e.payload}` : e.payload}
                  </p>
                  <p className="mono text-xs text-muted">{fmtDate(e.created_at, locale)}</p>
                </div>
              </li>
            ))}
          </ol>
          <form action={addNote.bind(null, app.id)} className="card p-5 rise" style={{ ["--i" as string]: 2 }}>
            <label className="label" htmlFor="text">{t.application.notes}</label>
            <textarea id="text" name="text" className="input !min-h-28" required />
            <div className="mt-3 flex justify-end"><SaveButton label={t.common.add} savedLabel={t.common.saved} /></div>
          </form>
        </div>
      )}
    </>
  );
}

import type { InterviewPrep } from "@/lib/types";
import type { Dict } from "@/lib/i18n/dict";

function InterviewView({ prep, t }: { prep: InterviewPrep; t: Dict }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <section className="card p-5 lg:col-span-2 rise" style={{ ["--i" as string]: 2 }}>
        <h2 className="text-xl mb-2">{t.application.pitch}</h2>
        <p className="leading-relaxed text-ink-2 max-w-3xl">{prep.pitch}</p>
      </section>
      <section className="card p-5 rise" style={{ ["--i" as string]: 3 }}>
        <h2 className="text-xl mb-3">{t.application.likely}</h2>
        <ol className="space-y-4">
          {prep.likely_questions.map((q, i) => (
            <li key={i} className="border-l-2 border-line pl-3">
              <p className="font-semibold">{q.question}</p>
              <p className="text-sm text-muted mt-1"><span className="font-semibold text-ink-2">{t.application.why}:</span> {q.why}</p>
              <p className="text-sm text-muted mt-0.5"><span className="font-semibold text-ink-2">{t.application.approach}:</span> {q.approach}</p>
            </li>
          ))}
        </ol>
      </section>
      <div className="space-y-4">
        <section className="card p-5 rise" style={{ ["--i" as string]: 4 }}>
          <h2 className="text-xl mb-3">{t.application.stories}</h2>
          <ul className="space-y-4">
            {prep.star_stories.map((s, i) => (
              <li key={i}>
                <p className="font-semibold">{s.title}</p>
                <dl className="mt-1 grid grid-cols-[1.2rem_1fr] gap-x-2 text-sm text-ink-2">
                  {(["situation", "task", "action", "result"] as const).map((k) => (
                    <div key={k} className="contents">
                      <dt className="mono text-accent uppercase"><span aria-hidden="true">{k[0]}</span><span className="sr-only">{k}</span></dt>
                      <dd>{s[k]}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5 rise" style={{ ["--i" as string]: 5 }}>
          <h2 className="text-xl mb-3">{t.application.ask}</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-ink-2">
            {prep.questions_to_ask.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}
