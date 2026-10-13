import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, CalendarClock, FileText, GraduationCap, Mail, MessageSquare, Mic, NotebookPen, Sparkles, StickyNote, UserRound } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { getApplication, getJob, latestEvaluation, listEvents } from "@/lib/db";
import type { AppEvent, AppState, InterviewPrep, Locale } from "@/lib/types";
import { getCvSource } from "@/lib/cv/source";
import { atsCheck, cvBase, type MessageType } from "@/lib/ai/apps";
import {
  computeChecklist,
  getExtras,
  listContacts,
  listInterviews,
  listReminders,
  localDate,
} from "@/lib/repo/apps";
import { LinkTabs, Progress } from "@/components/kit";
import { EngineChip, VerdictChip } from "@/components/ui";
import { ScoreBreakdown } from "@/components/score-breakdown";
import { DocEditor } from "@/components/doc-editor";
import { ActionButton } from "@/components/action-button";
import { WorkspaceHeader } from "@/components/pipeline/header";
import { Checklist, NotesCard } from "@/components/pipeline/overview";
import { SourceBar } from "@/components/pipeline/documents";
import { CvDropzone } from "@/components/pipeline/dropzone";
import { MessagesPanel } from "@/components/pipeline/messages";
import { ContactsPanel, InterviewsPanel, NoteForm, RemindersPanel } from "@/components/pipeline/panels";
import { daysSince, relTime, shortDate } from "@/components/pipeline/format";
import { generateDoc, generatePrep, saveDoc } from "@/app/actions/applications";

const TABS = ["overview", "documents", "messages", "interviews", "contacts", "reminders", "timeline"] as const;
type Tab = (typeof TABS)[number];
const PAST_APPLIED: AppState[] = ["applied", "responded", "interview", "offer", "hired"];

export async function generateMetadata({ params }: PageProps<"/app/pipeline/[id]">): Promise<Metadata> {
  const app = getApplication(Number((await params).id));
  const job = app && getJob(app.job_id);
  return { title: job ? `${job.title} — ${job.company}` : "Pipeline" };
}

export default async function ApplicationPage({ params, searchParams }: PageProps<"/app/pipeline/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const appId = Number(id);
  const app = Number.isInteger(appId) && appId > 0 ? getApplication(appId) : null;
  const job = app && getJob(app.job_id);
  if (!app || !job) notFound();
  const { t, locale } = await getDict();
  const a = t.apps2;
  const now = new Date();
  const nowMs = now.getTime();
  const today = localDate(now);
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const doc = sp.doc === "letter" ? "letter" : "cv";

  const ev = latestEvaluation(job.id);
  const extras = getExtras(app.id);
  const cvSrc = getCvSource();
  const override = extras.cv_override_text?.trim() ? extras : null;
  const source = override ? { text: override.cv_override_text!, format: "text" as const } : { text: cvSrc.text, format: cvSrc.format };
  const hasCv = source.text.trim().length >= 50;
  const contacts = listContacts(app.id);
  const interviews = listInterviews(app.id);
  const reminders = listReminders(app.id);
  const events = listEvents(app.id);
  const openReminders = reminders.filter((r) => !r.done);
  const nextInterview = interviews.find((i) => i.starts_at.slice(0, 10) >= today) ?? null;
  const overdue = !!app.next_action_at && app.next_action_at.slice(0, 10) < today;

  const checklist = computeChecklist(
    {
      profile_cv: hasCv,
      evaluated: !!ev,
      cv_tailored: !!app.cv_md?.trim(),
      letter: !!app.cover_letter_md?.trim(),
      applied: !!app.applied_at || PAST_APPLIED.includes(app.status),
      followup: events.some((e) => e.kind === "followup"),
      interview_prep: !!app.interview_prep,
    },
    extras.checklist,
  );

  const sourceLabel = override
    ? fmt(a.docs.sourceOverride, { name: override.cv_override_name ?? "CV", date: shortDate(override.cv_override_at, locale) })
    : cvSrc.format === "text" && cvSrc.fileName
      ? fmt(a.docs.sourceFile, { name: cvSrc.fileName, date: shortDate(cvSrc.uploadedAt, locale) })
      : a.docs.sourceProfileMd;
  const needCv = hasCv ? undefined : a.docs.needCv;
  const uploadSlot = (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <CvDropzone endpoint="/api/cv/upload" title={a.docs.uploadTitle} hint={a.docs.uploadHint} />
      <Link href="/app/profile" className="btn btn-ghost btn-sm justify-self-center">{a.docs.editProfile}</Link>
    </div>
  );

  const suggested: MessageType =
    app.status === "evaluated" ? "recruiter" : app.status === "interview" ? "thanks" : app.status === "offer" ? "negotiate" : app.status === "hired" ? "accept" : "followup";

  return (
    <>
      <WorkspaceHeader
        id={app.id}
        status={app.status}
        title={job.title}
        company={job.company}
        score={ev?.global ?? null}
        jobId={job.id}
        postingUrl={/^https?:\/\//.test(job.url) ? job.url : null}
      />

      <LinkTabs
        label={a.ws.tabsLabel}
        current={tab}
        tabs={TABS.map((k) => ({
          key: k,
          href: `/app/pipeline/${app.id}?tab=${k}`,
          label: a.ws.tabs[k],
          count: k === "interviews" ? interviews.length || undefined : k === "contacts" ? contacts.length || undefined : k === "reminders" ? openReminders.length || undefined : undefined,
        }))}
      />

      {tab === "overview" && (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5 rise" style={{ ["--i" as string]: 1 }}>
            <Checklist id={app.id} items={checklist.items} />
            <NotesCard id={app.id} initialNotes={app.notes} nextAction={app.next_action_at} overdue={overdue} />
          </div>
          <div className="space-y-5 rise" style={{ ["--i" as string]: 2 }}>
            <section className="card p-5" aria-labelledby="up-h">
              <h2 id="up-h" className="mb-3 text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{a.overview.upNext}</h2>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2.5">
                  <Mic size={16} aria-hidden="true" className="mt-0.5 text-saffron" />
                  {nextInterview ? (
                    <Link href={`/app/pipeline/${app.id}?tab=interviews`} className="hover:text-accent-text">
                      {a.interviews.kinds[nextInterview.kind]} · <span className="tabular">{shortDate(nextInterview.starts_at, locale, true)}</span>
                    </Link>
                  ) : (
                    <span className="text-muted">{a.overview.noInterview}</span>
                  )}
                </li>
                <li className="flex items-start gap-2.5">
                  <Bell size={16} aria-hidden="true" className="mt-0.5 text-accent-text" />
                  {openReminders[0] ? (
                    <Link href={`/app/pipeline/${app.id}?tab=reminders`} className={openReminders[0].due_at.slice(0, 10) < today ? "font-semibold text-danger" : "hover:text-accent-text"}>
                      {openReminders[0].title} · <span className="tabular">{shortDate(openReminders[0].due_at, locale)}</span>
                    </Link>
                  ) : (
                    <span className="text-muted">{a.overview.noReminder}</span>
                  )}
                </li>
                <li className="flex items-start gap-2.5">
                  <CalendarClock size={16} aria-hidden="true" className="mt-0.5 text-muted" />
                  <span className={app.applied_at ? "" : "text-muted"}>
                    {app.applied_at ? fmt(a.overview.appliedOn, { date: shortDate(app.applied_at, locale), n: daysSince(app.applied_at, nowMs) }) : a.overview.notApplied}
                  </span>
                </li>
              </ul>
            </section>
            <section className="card p-5" aria-labelledby="ev-h">
              <div className="flex items-center justify-between gap-3">
                <h2 id="ev-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{t.jobs.evaluation}</h2>
                {ev && <VerdictChip verdict={ev.verdict} t={t} />}
              </div>
              {ev ? (
                <>
                  <div className="mt-4"><ScoreBreakdown ev={ev} t={t} /></div>
                  {ev.summary && <p className="mt-4 text-sm leading-relaxed text-ink-2">{ev.summary}</p>}
                  <div className="mt-3"><EngineChip engine={ev.engine} t={t} /></div>
                </>
              ) : (
                <div className="mt-2">
                  <p className="hint">{t.jobs.notEvaluated}</p>
                  <Link href={`/app/jobs/${job.id}`} className="btn btn-secondary btn-sm mt-3">{t.jobs.evaluate}</Link>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="rise" style={{ ["--i" as string]: 1 }}>
          <nav aria-label={a.docs.switchLabel} className="mb-4 inline-flex overflow-hidden rounded-full border border-line-strong no-print">
            {(["cv", "letter"] as const).map((k) => (
              <Link
                key={k}
                href={`/app/pipeline/${app.id}?tab=documents&doc=${k}`}
                aria-current={doc === k ? "page" : undefined}
                className={`btn btn-sm rounded-none ${doc === k ? "bg-surface-3 text-ink" : "btn-ghost"}`}
              >
                {k === "cv" ? <FileText size={14} aria-hidden="true" /> : <Mail size={14} aria-hidden="true" />} {k === "cv" ? a.docs.cv : a.docs.letter}
              </Link>
            ))}
          </nav>
          {hasCv && <SourceBar appId={app.id} label={sourceLabel} isOverride={!!override} />}
          {doc === "cv" ? (
            <div className="grid items-start gap-5 xl:grid-cols-[1fr_300px]">
              <DocEditor
                key={`cv-${app.updated_at}`}
                value={app.cv_md}
                saveAction={saveDoc.bind(null, app.id, "cv")}
                generateAction={generateDoc.bind(null, app.id, "cv")}
                emptyText={t.application.noCv}
                generateLabel={t.application.tailorCv}
                generateHint={t.application.tailorHint}
                engine={extras.cv_engine}
                disabledReason={needCv}
                disabledSlot={needCv ? uploadSlot : undefined}
                downloads={{ docx: `/api/applications/${app.id}/export?doc=cv&format=docx`, md: `/api/applications/${app.id}/export?doc=cv&format=md` }}
                original={hasCv ? cvBase(source) : null}
              />
              <AtsPanel t={t} before={hasCv ? atsCheck(job, source.text) : null} after={app.cv_md ? atsCheck(job, app.cv_md) : null} />
            </div>
          ) : (
            <DocEditor
              key={`letter-${app.updated_at}`}
              value={app.cover_letter_md}
              saveAction={saveDoc.bind(null, app.id, "letter")}
              generateAction={generateDoc.bind(null, app.id, "letter")}
              emptyText={t.application.noLetter}
              generateLabel={t.application.letter}
              generateHint={t.application.letterHint}
              engine={extras.letter_engine}
              disabledReason={needCv}
              disabledSlot={needCv ? uploadSlot : undefined}
              downloads={{ docx: `/api/applications/${app.id}/export?doc=letter&format=docx`, md: `/api/applications/${app.id}/export?doc=letter&format=md` }}
            />
          )}
        </div>
      )}

      {tab === "messages" && (
        <div className="rise" style={{ ["--i" as string]: 1 }}>
          <MessagesPanel
            id={app.id}
            contacts={contacts.map((c) => ({ id: c.id, name: c.name, email: c.email }))}
            defaultDays={app.applied_at ? Math.max(1, daysSince(app.applied_at, nowMs)) : 7}
            suggested={suggested}
          />
        </div>
      )}

      {tab === "interviews" && (
        <div className="space-y-8 rise" style={{ ["--i" as string]: 1 }}>
          <InterviewsPanel appId={app.id} interviews={interviews} today={today} />
          <section aria-labelledby="prep-h" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="prep-h" className="text-lg">{a.interviews.prepTitle}</h2>
              {app.interview_prep && <EngineChip engine={app.interview_prep.engine} t={t} />}
              <div className="ml-auto flex flex-wrap gap-2">
                <Link href={`/app/coach?application=${app.id}`} className="btn btn-secondary btn-sm">
                  <GraduationCap size={14} aria-hidden="true" /> {a.interviews.prepare}
                </Link>
                <ActionButton action={generatePrep.bind(null, app.id)} pendingLabel={t.common.generating} className="btn btn-primary btn-sm">
                  <Sparkles size={14} aria-hidden="true" /> {app.interview_prep ? t.common.regenerate : t.application.prep}
                </ActionButton>
              </div>
            </div>
            {app.interview_prep ? <PrepView prep={app.interview_prep} t={t} /> : <p className="card px-4 py-6 text-center text-sm text-muted">{t.application.prepHint}</p>}
          </section>
        </div>
      )}

      {tab === "contacts" && (
        <div className="rise" style={{ ["--i" as string]: 1 }}>
          <ContactsPanel appId={app.id} contacts={contacts} />
        </div>
      )}

      {tab === "reminders" && (
        <div className="rise" style={{ ["--i" as string]: 1 }}>
          <RemindersPanel appId={app.id} reminders={reminders} today={today} />
        </div>
      )}

      {tab === "timeline" && (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px] rise" style={{ ["--i" as string]: 1 }}>
          <section className="card p-5" aria-labelledby="tl-h">
            <h2 id="tl-h" className="mb-4 text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{a.ws.tabs.timeline}</h2>
            {events.length === 0 ? (
              <p className="text-sm text-muted">{a.timeline.empty}</p>
            ) : (
              <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
                {events.map((e) => (
                  <li key={e.id} className="relative grid grid-cols-[32px_1fr] gap-3">
                    <EventIcon kind={e.kind as EvKind} />
                    <div className="min-w-0 pt-1">
                      <p className={`text-sm ${e.kind === "note" ? "whitespace-pre-line text-ink-2" : "font-medium"}`}>{eventText(e, t)}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        <time dateTime={e.created_at.replace(" ", "T") + "Z"} title={shortDate(e.created_at, locale, true)}>{relTime(e.created_at, locale as Locale, nowMs)}</time>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <NoteForm appId={app.id} />
        </div>
      )}
    </>
  );
}

type EvKind = AppEvent["kind"] | "interview";
const EV: Record<EvKind, { icon: React.ReactNode; cls: string }> = {
  status: { icon: <NotebookPen size={14} aria-hidden="true" />, cls: "bg-accent-soft text-accent-text" },
  note: { icon: <StickyNote size={14} aria-hidden="true" />, cls: "bg-surface-3 text-ink-2" },
  followup: { icon: <MessageSquare size={14} aria-hidden="true" />, cls: "bg-success-soft text-success" },
  doc: { icon: <FileText size={14} aria-hidden="true" />, cls: "bg-saffron-soft text-saffron" },
  interview: { icon: <Mic size={14} aria-hidden="true" />, cls: "bg-saffron-soft text-saffron" },
};
function EventIcon({ kind }: { kind: EvKind }) {
  const e = EV[kind] ?? { icon: <UserRound size={14} aria-hidden="true" />, cls: "bg-surface-3 text-muted" };
  return <span className={`relative z-[1] grid size-8 place-items-center rounded-full ring-4 ring-[var(--surface)] ${e.cls}`}>{e.icon}</span>;
}

function eventText(e: AppEvent, t: Dict): string {
  const l = t.apps2.timeline;
  if (e.kind === "status") return fmt(l.statusTo, { s: t.states[e.payload as AppState] ?? e.payload });
  if (e.kind === "doc") return l.docs[e.payload as keyof typeof l.docs] ?? e.payload;
  if (e.kind === "followup") return fmt(l.sent, { x: e.payload });
  if ((e.kind as string) === "interview") return fmt(l.interview, { x: e.payload });
  return e.payload;
}

function AtsPanel({ t, before, after }: { t: Dict; before: ReturnType<typeof atsCheck> | null; after: ReturnType<typeof atsCheck> | null }) {
  const d = t.apps2.docs;
  const r = after ?? before;
  return (
    <aside className="card p-5 no-print" aria-labelledby="ats-h">
      <h2 id="ats-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{d.ats}</h2>
      <p className="hint mt-1">{d.atsHint}</p>
      {!r || r.pct === null ? (
        <p className="mt-4 text-sm text-muted">{d.atsNone}</p>
      ) : (
        <>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="display text-4xl tabular">{r.pct}%</span>
            <span className="text-sm text-muted">{after ? d.tailored : d.original}</span>
          </p>
          {after && before && before.pct !== null && (
            <p className="mt-1 text-xs text-muted tabular">{fmt(d.atsBefore, { n: before.pct })}</p>
          )}
          <div className="mt-3">
            <Progress value={r.pct} label={d.ats} tone={r.pct >= 70 ? "success" : r.pct >= 40 ? "saffron" : "danger"} />
          </div>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted" style={{ fontFamily: "var(--font-sans)" }}>{fmt(d.present, { n: r.present.length })}</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {r.present.map((k) => <li key={k} className="chip chip-success">{k}</li>)}
          </ul>
          {r.missing.length > 0 && (
            <>
              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted" style={{ fontFamily: "var(--font-sans)" }}>{fmt(d.missing, { n: r.missing.length })}</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {r.missing.map((k) => <li key={k} className="chip">{k}</li>)}
              </ul>
              <p className="hint mt-3">{d.missingHint}</p>
            </>
          )}
        </>
      )}
    </aside>
  );
}

function PrepView({ prep, t }: { prep: InterviewPrep; t: Dict }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-5 lg:col-span-2">
        <h3 className="mb-2 text-lg">{t.application.pitch}</h3>
        <p className="max-w-3xl leading-relaxed text-ink-2">{prep.pitch}</p>
      </section>
      <section className="card p-5">
        <h3 className="mb-3 text-lg">{t.application.likely}</h3>
        <ol className="space-y-4">
          {prep.likely_questions.map((q, i) => (
            <li key={i} className="border-l-2 border-line pl-3">
              <p className="font-semibold">{q.question}</p>
              <p className="mt-1 text-sm text-muted"><span className="font-semibold text-ink-2">{t.application.why}:</span> {q.why}</p>
              <p className="mt-0.5 text-sm text-muted"><span className="font-semibold text-ink-2">{t.application.approach}:</span> {q.approach}</p>
            </li>
          ))}
        </ol>
      </section>
      <div className="space-y-4">
        <section className="card p-5">
          <h3 className="mb-3 text-lg">{t.application.stories}</h3>
          <ul className="space-y-4">
            {prep.star_stories.map((s, i) => (
              <li key={i}>
                <p className="font-semibold">{s.title}</p>
                <dl className="mt-1 grid grid-cols-[1.2rem_1fr] gap-x-2 text-sm text-ink-2">
                  {(["situation", "task", "action", "result"] as const).map((k) => (
                    <div key={k} className="contents">
                      <dt className="mono uppercase text-accent-text"><span aria-hidden="true">{k[0]}</span><span className="sr-only">{k}</span></dt>
                      <dd>{s[k]}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h3 className="mb-3 text-lg">{t.application.ask}</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            {prep.questions_to_ask.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}
