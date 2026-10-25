import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleCheck, Download, ExternalLink, FileText, GraduationCap, Mail, MessageSquare, Mic, NotebookPen, Sparkles, StickyNote, UserRound } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { dicts, fmt, type Dict } from "@/lib/i18n/dict";
import { postingLocale } from "@/lib/ai/heuristic";
import { getChecks } from "@/lib/company";
import { getApplication, getJob, getProfile, latestEvaluation, listEvents } from "@/lib/db";
import type { AppEvent, AppState, InterviewPrep, Locale } from "@/lib/types";
import { getCvSource } from "@/lib/cv/source";
import { atsCheck, cvBase, type MessageType } from "@/lib/ai/apps";
import {
  cadenceFor,
  computeChecklist,
  contactsAtCompany,
  getExtras,
  LETTER_SKIPPED,
  getOffer,
  listContacts,
  listInterviews,
  listReminders,
  localDate,
} from "@/lib/repo/apps";
import { EngineChip } from "@/components/ui";
import { employerLink, hostClass } from "@/lib/sources/trust";
import { ActionButton } from "@/components/action-button";
import { DocEditor } from "@/components/doc-editor";
import { WorkspaceHeader } from "@/components/pipeline/header";
import { Checklist, NotesCard } from "@/components/pipeline/overview";
import { SourceBar } from "@/components/pipeline/documents";
import { CvDropzone } from "@/components/pipeline/dropzone";
import { MessagesPanel } from "@/components/pipeline/messages";
import { ReplyClassifier } from "@/components/pipeline/reply-classifier";
import { CadenceBanner, toView } from "@/components/pipeline/cadence";
import { MarkSentButton } from "@/components/pipeline/mark-sent";
import { ApplyFormCard } from "@/components/pipeline/apply-form-card";
import { PackButton } from "@/components/pipeline/pack-button";
import { ContactSuggestions, ContactsPanel, InterviewsPanel, NoteForm, RemindersPanel } from "@/components/pipeline/panels";
import { daysSince, relTime, shortDate } from "@/components/pipeline/format";
import { generateDoc, generatePrep, saveDoc, skipLetter } from "@/app/actions/applications";
import { listStories } from "@/lib/repo/coach";
import { mapStories } from "@/lib/coach/logic";
import { likelyConcerns } from "@/lib/coach/concerns";
import { ConcernsCard, StoryMapCard } from "@/components/coach/readiness";
import { SafetyCard } from "@/components/apply/readiness";
import { AnswersStep } from "@/components/apply/answers";
import { OutcomeButton } from "@/components/apply/outcome";
import { detectQuestions } from "@/lib/apply/questions";
import { formReadable } from "@/lib/apply-form";
import { getFields, getPack, listAnswers, priorApplications } from "@/lib/apply/repo";
import { atsKind, knockouts } from "@/lib/apply/knockout";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { getDocStyle } from "@/lib/cv/doc-style-store";
import { DocStylePanel } from "@/components/pipeline/doc-style-panel";
import { PdfCheck } from "@/components/pipeline/pdf-check";
import { OfferCard } from "@/components/pipeline/offer-card";
import { hasOffer } from "@/lib/apps/offer";

const TABS = ["overview", "documents", "messages", "interviews", "contacts", "reminders", "timeline"] as const;
type Tab = (typeof TABS)[number];
const AFTER_TABS: Tab[] = ["messages", "interviews", "contacts", "reminders", "timeline"];
const PAST_APPLIED: AppState[] = ["applied", "responded", "interview", "offer", "hired"];
type Step = "tailor" | "letter" | "review" | "after";
const STEPS: Step[] = ["tailor", "letter", "review", "after"];
// ponytail: tiny string hash so the editor remounts on new content, not on every stage change.
const hash = (s: string | null) => [...(s ?? "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const words = (x: string | null) => (x ?? "").replace(/[#>*_`|[\]()-]+/g, " ").split(/\s+/).filter(Boolean).length;

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
  const F = a.flow;
  const now = new Date();
  const nowMs = now.getTime();
  const today = localDate(now);
  const applied = !!app.applied_at || PAST_APPLIED.includes(app.status);
  const extras = getExtras(app.id);
  const defaultTab: Tab = applied ? "messages" : !app.cv_md?.trim() ? "documents" : !app.cover_letter_md?.trim() && !extras.checklist.includes(LETTER_SKIPPED) ? "documents" : "overview";
  const defaultDoc = app.cv_md?.trim() ? "letter" : "cv";
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : defaultTab;
  const doc = sp.doc === "letter" || sp.doc === "cv" ? sp.doc : tab === "documents" && !sp.tab ? defaultDoc : "cv";
  const step: Step = tab === "documents" ? (doc === "letter" ? "letter" : "tailor") : tab === "overview" ? "review" : "after";
  const stepHref = (k: Step) => (k === "tailor" ? `/app/pipeline/${appId}?tab=documents&doc=cv` : k === "letter" ? `/app/pipeline/${appId}?tab=documents&doc=letter` : k === "review" ? `/app/pipeline/${appId}?tab=overview` : `/app/pipeline/${appId}?tab=messages`);

  const ev = latestEvaluation(job.id);
  const cvSrc = getCvSource();
  const override = extras.cv_override_text?.trim() ? extras : null;
  const source = override ? { text: override.cv_override_text!, format: "text" as const } : { text: cvSrc.text, format: cvSrc.format };
  const hasCv = source.text.trim().length >= 50;
  const contacts = listContacts(app.id);
  const contactEmail = contacts.find((c) => c.email)?.email ?? null;
  const employerUrl = employerLink(job.url, job.description ?? "");
  const applyEmail = contactEmail ?? (job.description?.match(EMAIL) ?? []).find((e) => !/no-?reply/i.test(e)) ?? null;
  const interviews = listInterviews(app.id);
  const reminders = listReminders(app.id);
  const events = listEvents(app.id);
  const openReminders = reminders.filter((r) => !r.done);
  const overdue = !!app.next_action_at && app.next_action_at.slice(0, 10) < today;
  const hasLetter = !!app.cover_letter_md?.trim();
  // "Skip this step" sticks: no letter is asked for in the rail, the pack or "I've sent it".
  const letterSkipped = !hasLetter && extras.checklist.includes(LETTER_SKIPPED);
  const letterDone = hasLetter || letterSkipped;
  const PLACEHOLDER = /\[[^\]]+\](?!\()/;

  const checklist = computeChecklist(
    {
      profile_cv: hasCv,
      evaluated: !!ev,
      cv_tailored: !!app.cv_md?.trim(),
      letter: letterDone,
      applied,
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
  const stories = tab === "interviews" ? listStories() : [];
  const storyMap = stories.length && app.interview_prep ? mapStories(stories, app.interview_prep.likely_questions.map((q) => q.question)) : null;
  const concerns = tab === "interviews" ? likelyConcerns(job, getProfile(), ev, locale) : [];
  const cadence = toView(cadenceFor([{ id: app.id, status: app.status, applied_at: app.applied_at, company: job.company }], now).get(app.id));
  // Review step: everything the old apply assistant had (knock-outs, repeat warning, ATS tips, form answers).
  const review =
    tab === "overview"
      ? {
          safety: { knockouts: knockouts(job, getProfile(), getProfileExtra(), app.cv_md?.trim() || source.text || getProfile().cv_md), repeat: priorApplications(job.company, app.id), ats: atsKind(job.url) },
          questions: detectQuestions(`${job.title}\n${job.description}`),
          saved: listAnswers(app.id),
          fields: getFields(app.id),
        }
      : null;
  const pack = AFTER_TABS.includes(tab) ? getPack(app.id) : null;
  const known = tab === "overview" || tab === "contacts" ? contactsAtCompany(job.company, app.id) : [];
  const lastCheck = tab === "overview" ? getChecks([job.id]).get(job.id) : undefined;
  // A check from the last 24 h is reused; older ones run again when the review step opens.
  const freshCheck = lastCheck && nowMs - Date.parse(lastCheck.checked_at.replace(" ", "T") + "Z") < 86_400_000 ? { alive: lastCheck.status === "unknown" ? null : lastCheck.status === "open", status: lastCheck.http_status ?? 0 } : null;
  // The e-mail goes to the employer: written in the posting's language, and it only mentions a letter that exists.
  const PF = dicts[postingLocale(job, locale)].apps2.flow;
  const missingDocs = [...(app.cv_md?.trim() ? [] : ["cv" as const]), ...(letterDone ? [] : ["letter" as const])];
  const sentButton = (className?: string) => (
    <MarkSentButton
      id={app.id}
      status={app.status}
      title={`${job.company} — ${job.title}`}
      missing={missingDocs}
      afterHref={stepHref("after")}
      channel={applyEmail && (!contactEmail || !/^https?:\/\//.test(job.url)) ? "email" : "site"}
      answers={review?.saved.filter((x) => x.answer.trim()).length ?? 0}
      unfilled={review?.saved.filter((x) => PLACEHOLDER.test(x.answer)).length ?? 0}
      unfilledDocs={(["cv", "letter"] as const).filter((k) => PLACEHOLDER.test((k === "cv" ? app.cv_md : app.cover_letter_md) ?? ""))}
      className={className}
    />
  );
  const offer = getOffer(app.id);
  const docStyle = getDocStyle();
  // Changes with the style, so the preview frame reloads after "Mise en page" edits.
  const styleKey = encodeURIComponent(Object.values(docStyle).join("-"));

  return (
    <>
      <WorkspaceHeader
        id={app.id}
        status={app.status}
        title={job.title}
        company={job.company}
        meta={[t.jobTypes[job.type], job.location, app.applied_at ? fmt(a.overview.appliedOn, { date: shortDate(app.applied_at, locale), n: daysSince(app.applied_at, nowMs) }) : a.overview.notApplied, !applied && job.deadline ? `${t.common.deadline} ${shortDate(job.deadline, locale)}` : ""].filter(Boolean).join(" · ")}
        jobId={job.id}
        postingUrl={/^https?:\/\//.test(job.url) ? job.url : null}
        missing={missingDocs}
      />
      <CadenceBanner id={app.id} c={cadence} t={t} locale={locale} />

      {/* Step rail: the application is a path, not a set of tabs */}
      <ol aria-label={F.stepsLabel} className="card mb-[18px] grid grid-cols-2 gap-1 p-1.5 no-print lg:grid-cols-4">
        {STEPS.map((k, i) => {
          const done = k === "tailor" ? !!app.cv_md?.trim() : k === "letter" ? letterDone : k === "review" ? applied : false;
          const current = k === step;
          return (
            <li key={k}>
              <Link
                href={stepHref(k)}
                aria-current={current ? "step" : undefined}
                className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition-colors ${current ? "bg-accent-soft" : "hover:bg-surface-2"}`}
              >
                <span className={`mono grid size-[26px] shrink-0 place-items-center rounded-full text-[0.72rem] font-bold ${done ? "bg-success text-white" : current ? "bg-accent text-accent-ink" : "bg-surface-3 text-ink-2"}`}>
                  {done ? <Check size={13} aria-hidden="true" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block whitespace-nowrap text-[0.85rem] font-semibold ${current ? "text-ink" : "text-ink-2"}`}>
                    {F.steps[k].label}
                    {done && <span className="sr-only"> ({k === "letter" && letterSkipped ? F.stepSkipped : F.stepDone})</span>}
                  </span>
                  <span className="block truncate text-[0.7rem] text-muted">{F.steps[k].hint}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {tab === "overview" && (
        <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_320px]" style={{ animation: "fade .25s ease both" }}>
          <section className="flex flex-col gap-3">
            {review && !applied && <SafetyCard id={app.id} safety={review.safety} company={job.company} manual={!/^https?:\/\//i.test(job.url)} checked={freshCheck} />}
            <div className="card p-[18px]">
              <h2 className="mb-3 text-[1.15rem] tracking-[-0.01em]">{F.pack}</h2>
              {missingDocs.length > 0 && (
                <PackButton id={app.id} missing={missingDocs.length === 2 ? "both" : missingDocs[0]} needCvHref={hasCv ? undefined : stepHref("tailor")} />
              )}
              <ul className="flex flex-col gap-2">
                {([["cv", app.cv_md, F.packCv], ["letter", app.cover_letter_md, F.packLetter]] as const).map(([k, text, label]) => (
                  <li key={k} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-line bg-bg-elev px-3 py-2.5">
                    <span className={`tile tile-sm ${text?.trim() ? "tone-success" : "tone-muted"}`}>{k === "cv" ? <FileText size={16} aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{label}</p>
                      <p className={`text-[0.75rem] ${text?.trim() && words(text) > (k === "cv" ? 900 : 320) ? "text-danger" : "text-muted"}`}>
                        {text?.trim() ? fmt(F.packWords, { n: words(text) }) : k === "letter" && letterSkipped ? F.letterSkipped : F.packMissing}
                        {text?.trim() && words(text) > (k === "cv" ? 900 : 320) && ` · ${fmt(a.docs.tooLongShort, { p: k === "cv" ? 2 : 1 })}`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Link href={`/app/pipeline/${app.id}?tab=documents&doc=${k}`} className="btn btn-outline btn-sm !h-7 text-ink-2">{k === "letter" && letterSkipped ? F.writeLetter : F.edit}</Link>
                      {text?.trim() && (
                        <>
                          <a href={`/api/applications/${app.id}/export?doc=${k}&format=pdf`} download className="btn btn-outline btn-sm !h-7 text-ink-2" aria-label={fmt(F.dlPdf, { doc: label })} title={fmt(F.dlPdf, { doc: label })}>
                            <Download size={13} aria-hidden="true" /> PDF
                          </a>
                          <a href={`/api/applications/${app.id}/export?doc=${k}&format=docx`} className="btn btn-outline btn-sm !h-7 text-ink-2" aria-label={fmt(F.dlDocx, { doc: label })} title={fmt(F.dlDocx, { doc: label })} download>
                            DOCX
                          </a>
                        </>
                      )}
                    </div>
                    {text?.trim() && <PdfCheck id={app.id} kind={k} />}
                  </li>
                ))}
              </ul>
            </div>
            {/* How to apply sits right under the pack: the portal is the next click, not 5,000 px down on a phone. */}
            <div className="card p-[18px]">
              <h2 className="mb-1 text-[1.15rem] tracking-[-0.01em]">{F.howToApply}</h2>
              <p className="mb-3 text-[0.82rem] text-muted">{F.howToApplyLead}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {applyEmail ? (
                  <a href={`mailto:${applyEmail}?subject=${encodeURIComponent(fmt(PF.mailSubject, { title: job.title }))}&body=${encodeURIComponent(fmt(hasLetter ? PF.mailBody : PF.mailBodyCv, { title: job.title, name: getProfile().name }))}`} className="flex items-center gap-2.5 rounded-xl border border-line p-3 text-left hover:border-line-strong">
                    <Mail size={18} aria-hidden="true" className="text-accent-text" />
                    <span className="min-w-0">
                      <span className="block text-[0.85rem] font-semibold">{F.email}</span>
                      <span className="block truncate text-[0.72rem] text-muted">{applyEmail} · {contactEmail ? F.emailHint : F.emailFromPosting}</span>
                    </span>
                  </a>
                ) : (
                  <Link href={`/app/pipeline/${app.id}?tab=contacts`} className="flex items-center gap-2.5 rounded-xl border border-dashed border-line-strong p-3 text-left hover:bg-surface-2">
                    <Mail size={18} aria-hidden="true" className="text-muted" />
                    <span>
                      <span className="block text-[0.85rem] font-semibold">{F.email}</span>
                      <span className="block text-[0.72rem] text-muted">{F.noEmail}</span>
                    </span>
                  </Link>
                )}
                {/^https?:\/\//.test(job.url) ? (
                  <a href={employerUrl ?? job.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-xl border border-line p-3 text-left hover:border-line-strong">
                    <ExternalLink size={18} aria-hidden="true" className="text-accent-text" />
                    <span>
                      <span className="block text-[0.85rem] font-semibold">{F.portal}</span>
                      <span className="block text-[0.72rem] text-muted">{new URL(employerUrl ?? job.url).host} · {employerUrl ? F.portalEmployerHint : hostClass(job.url) === "portal" ? F.portalBoardHint : F.portalHint}</span>
                    </span>
                  </a>
                ) : (
                  <span className="flex items-center gap-2.5 rounded-xl border border-dashed border-line-strong p-3 text-left opacity-70">
                    <ExternalLink size={18} aria-hidden="true" className="text-muted" />
                    <span>
                      <span className="block text-[0.85rem] font-semibold">{F.portal}</span>
                      <span className="block text-[0.72rem] text-muted">{F.noPortal}</span>
                    </span>
                  </span>
                )}
              </div>
              {!applied && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
                  <p className="min-w-0 flex-1 basis-60 text-[0.8rem] text-muted">{F.sentPrompt}</p>
                  {sentButton("btn btn-outline btn-sm")}
                </div>
              )}
            </div>
            {review && (
              <AnswersStep id={app.id} questions={review.questions} saved={review.saved} fields={review.fields} hasCv={hasCv || !!app.cv_md?.trim()} formSource={formReadable(job.url)} />
            )}
            <Suspense fallback={null}>
              <ApplyFormCard url={job.url} />
            </Suspense>
            <NotesCard id={app.id} initialNotes={app.notes} nextAction={app.next_action_at} overdue={overdue} />
          </section>
          <aside className="flex flex-col gap-3.5">
            <ContactSuggestions appId={app.id} company={job.company} people={known} />
            <Checklist id={app.id} items={checklist.items} />
            <section className="card p-4">
              <h2 className="card-title mb-1.5 text-[0.9rem]">{F.afterApply}</h2>
              <p className="text-[0.78rem] leading-relaxed text-muted">{F.afterApplyText}</p>

            </section>
          </aside>
        </div>
      )}

      {tab === "documents" && (
        <div style={{ animation: "fade .25s ease both" }}>
          {hasCv && <SourceBar appId={app.id} label={sourceLabel} isOverride={!!override} />}
          <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_320px]">
            {doc === "cv" ? (
              <DocEditor
                key={`cv-${hash(app.cv_md)}`}
                value={app.cv_md}
                saveAction={saveDoc.bind(null, app.id, "cv")}
                generateAction={generateDoc.bind(null, app.id, "cv")}
                emptyText={t.application.noCv}
                generateLabel={t.application.tailorCv}
                generateHint={t.application.tailorHint}
                engine={extras.cv_engine}
                disabledReason={needCv}
                disabledSlot={needCv ? uploadSlot : undefined}
                downloads={{ pdf: `/api/applications/${app.id}/export?doc=cv&format=pdf`, docx: `/api/applications/${app.id}/export?doc=cv&format=docx`, md: `/api/applications/${app.id}/export?doc=cv&format=md` }}
                preview={`/print/${app.id}?doc=cv&embed=1&v=${styleKey}`}
                original={hasCv ? cvBase(source) : null}
                limit={{ words: 900, pages: 2 }}
              />
            ) : (
              <DocEditor
                key={`letter-${hash(app.cover_letter_md)}`}
                value={app.cover_letter_md}
                saveAction={saveDoc.bind(null, app.id, "letter")}
                generateAction={generateDoc.bind(null, app.id, "letter")}
                emptyText={t.application.noLetter}
                generateLabel={t.application.letter}
                generateHint={t.application.letterHint}
                engine={extras.letter_engine}
                disabledReason={needCv}
                disabledSlot={needCv ? uploadSlot : undefined}
                downloads={{ pdf: `/api/applications/${app.id}/export?doc=letter&format=pdf`, docx: `/api/applications/${app.id}/export?doc=letter&format=docx`, md: `/api/applications/${app.id}/export?doc=letter&format=md` }}
                preview={`/print/${app.id}?doc=letter&embed=1&v=${styleKey}`}
                original={hasCv ? cvBase(source) : null}
                compare={false}
                limit={{ words: 320, pages: 1 }}
              />
            )}
            <aside className="no-print flex flex-col gap-3.5">
              {(doc === "cv" ? app.cv_md : app.cover_letter_md)?.trim() && <DocStylePanel initial={docStyle} />}
              {doc === "cv" && <AtsPanel t={t} before={hasCv ? atsCheck(job, source.text) : null} after={app.cv_md ? atsCheck(job, app.cv_md) : null} />}
              {/* "Before you send" lists only what comes before sending, so it can be completed. */}
              <Checklist id={app.id} items={checklist.items.filter((i) => !["applied", "followup", "interview_prep"].includes(i.key))} compact title={F.beforeSend} />
              <Link href={`/app/coach?application=${app.id}`} className="inline-flex items-center gap-1.5 px-1 text-[0.8rem] font-semibold">
                <GraduationCap size={13} aria-hidden="true" /> {F.prepareInterview}
              </Link>
            </aside>
          </div>
        </div>
      )}

      {AFTER_TABS.includes(tab) && (
        <>
          {applied && (
            <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-xl bg-success-soft px-3.5 py-3 text-success" style={{ animation: "pop .3s ease both" }}>
              <CircleCheck size={18} aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{fmt(F.appliedOn, { date: shortDate(app.applied_at ?? app.updated_at, locale) })}</span>
                {app.status === "applied" && app.next_action_at && <span className="block text-[0.8rem] text-ink-2">{fmt(F.appliedNext, { date: shortDate(app.next_action_at, locale) })}</span>}
              </p>
              {pack && <OutcomeButton id={app.id} pack={pack} />}
              <Link href="/app/pipeline" className="text-[0.8rem] font-semibold text-success">{F.seePipeline}</Link>
            </div>
          )}
          {(app.status === "offer" || app.status === "hired" || hasOffer(offer)) && (
            <div className="mb-3.5">
              <OfferCard id={app.id} initial={offer} />
            </div>
          )}
          <div role="tablist" aria-label={a.ws.tabsLabel} className="seg mb-3.5 max-w-full overflow-x-auto no-print">
            {AFTER_TABS.map((k) => {
              const n = k === "interviews" ? interviews.length : k === "contacts" ? contacts.length : k === "reminders" ? openReminders.length : 0;
              return (
                <Link key={k} href={`/app/pipeline/${app.id}?tab=${k}`} role="tab" aria-selected={tab === k} className="seg-btn">
                  {a.ws.tabs[k]}
                  {n > 0 && <span className="n">{n}</span>}
                </Link>
              );
            })}
          </div>
        </>
      )}

      {tab === "messages" && (
        <div className="space-y-5 rise" style={{ ["--i" as string]: 1 }}>
          <MessagesPanel
            id={app.id}
            contacts={contacts.map((c) => ({ id: c.id, name: c.name, email: c.email }))}
            defaultDays={app.applied_at ? Math.max(1, daysSince(app.applied_at, nowMs)) : 7}
            suggested={suggested}
            cadence={cadence}
            initialDraft={typeof sp.draft === "string" ? sp.draft : undefined}
          />
          <ReplyClassifier id={app.id} currentStatus={app.status} />
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
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <StoryMapCard map={storyMap} hasQuestions={!!app.interview_prep?.likely_questions.length} t={t} />
            <ConcernsCard concerns={concerns} t={t} />
          </div>
        </div>
      )}

      {tab === "contacts" && (
        <div className="space-y-4 rise" style={{ ["--i" as string]: 1 }}>
          <ContactSuggestions appId={app.id} company={job.company} people={known} />
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

      {/* Flow bar: always know where you are and what is next */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-[22px] flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur-md no-print sm:-mx-8 sm:px-8">
        <p className="min-w-0 text-[0.82rem] text-muted">
          {step === "after" ? (
            // After sending, the stage and the next date matter, not "step 4 of 4".
            <>
              <span className="font-semibold text-ink">{t.states[app.status]}</span>
              {cadence?.nextDue && ` · ${fmt(F.nextTouch, { date: shortDate(cadence.nextDue, locale) })}`}
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">{fmt(F.stepOf, { n: STEPS.indexOf(step) + 1 })}</span> · {F.steps[step].label}
            </>
          )}
        </p>
        <span className="flex-1" />
        {STEPS.indexOf(step) > 0 && (
          <Link href={stepHref(STEPS[STEPS.indexOf(step) - 1])} className="btn btn-outline !h-10">
            <ArrowLeft size={14} aria-hidden="true" /> {F.back}
          </Link>
        )}
        {step === "letter" && !hasLetter && (
          <form action={skipLetter.bind(null, app.id)}>
            <button type="submit" className="btn btn-ghost !h-10 text-ink-2">{F.skipStep}</button>
          </form>
        )}
        {step === "review" && !applied ? (
          sentButton()
        ) : step === "after" ? (
          <Link href="/app/pipeline" className="btn btn-primary !h-10">{F.toPipeline}</Link>
        ) : (
          <Link href={stepHref(STEPS[STEPS.indexOf(step) + 1])} className={`btn !h-10 ${step === "review" ? "btn-saffron" : "btn-primary"}`}>
            {step === "review" ? F.steps.after.label : F.next} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
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
  message: { icon: <MessageSquare size={14} aria-hidden="true" />, cls: "bg-accent-soft text-accent-text" },
  outcome: { icon: <NotebookPen size={14} aria-hidden="true" />, cls: "bg-surface-3 text-ink-2" },
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
  if (e.kind === "message") return e.payload.split("\n")[0] + (e.payload.includes("\n") ? ` · ${e.payload.slice(e.payload.indexOf("\n") + 1, e.payload.indexOf("\n") + 161).replace(/\s+/g, " ")}${e.payload.length > 160 ? "…" : ""}` : "");
  return e.payload;
}

function AtsPanel({ t, before, after }: { t: Dict; before: ReturnType<typeof atsCheck> | null; after: ReturnType<typeof atsCheck> | null }) {
  const d = t.apps2.docs;
  const F = t.apps2.flow;
  const r = after ?? before;
  const now = r?.pct ?? null;
  const was = after && before ? before.pct : null;
  return (
    <aside className="card p-4 no-print" aria-labelledby="ats-h">
      <h2 id="ats-h" className="card-title text-[0.9rem]">{F.keywordMatch}</h2>
      {now === null ? (
        <p className="mt-3 text-sm text-muted">{d.atsNone}</p>
      ) : (
        <>
          <div className="mt-3 flex items-end gap-2.5">
            <span className="display tabular text-[2.4rem] leading-none">{now}%</span>
            {was !== null && <span className="pb-1 text-[0.78rem] text-muted">{fmt(F.was, { n: was })}</span>}
          </div>
          <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-surface-3">
            {was !== null && <span className="absolute inset-y-0 left-0 rounded-full bg-line-strong" style={{ width: `${was}%` }} />}
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${now}%`, background: now >= 70 ? "var(--success)" : now >= 40 ? "var(--saffron)" : "var(--danger)", transition: "width 1.1s cubic-bezier(.2,.7,.2,1)" }} />
          </div>
          <p className="mt-2.5 text-[0.75rem] text-muted">{F.keywordHint}</p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {r!.present.map((k) => <li key={k} className="chip chip-success !py-0 text-[0.72rem]">{k}</li>)}
            {r!.missing.map((k) => <li key={k} className="chip !py-0 text-[0.72rem]">{k}</li>)}
          </ul>
          {r!.missing.length > 0 && <p className="hint mt-2.5">{d.missingHint}</p>}
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
