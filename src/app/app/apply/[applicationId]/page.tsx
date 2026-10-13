import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getApplication, getJob, getProfile, latestEvaluation } from "@/lib/db";
import { getCvSource } from "@/lib/cv/source";
import { listContacts } from "@/lib/repo/apps";
import { detectQuestions } from "@/lib/apply/questions";
import { getPack, listAnswers } from "@/lib/apply/repo";
import { CompanyAvatar, PageHeader } from "@/components/kit";
import { ScoreRing, StateChip, fmtDate, scoreLabel } from "@/components/ui";
import { ApplyWizard } from "@/components/apply/wizard";
import { STEPS, type Step } from "@/lib/apply/types";
import { OutcomeButton } from "@/components/apply/outcome";

type Props = { params: Promise<{ applicationId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const app = getApplication(Number((await params).applicationId));
  const job = app && getJob(app.job_id);
  return { title: job ? `${job.title} — ${job.company}` : "Apply" };
}

export default async function ApplyPage({ params, searchParams }: Props) {
  const id = Number((await params).applicationId);
  const sp = await searchParams;
  const app = Number.isInteger(id) && id > 0 ? getApplication(id) : null;
  const job = app && getJob(app.job_id);
  if (!app || !job) notFound();
  const { t, locale } = await getDict();
  const w = t.apply2.wizard;
  const profile = getProfile();
  const ev = latestEvaluation(job.id);
  const contacts = listContacts(id).map((c) => ({ id: c.id, name: c.name, email: c.email }));
  const saved = listAnswers(id);
  const pack = getPack(id);
  const step: Step = STEPS.includes(sp.step as Step) ? (sp.step as Step) : "ready";

  return (
    <>
      <PageHeader
        eyebrow={w.eyebrow}
        back={{ href: `/app/pipeline/${id}`, label: w.back }}
        title={
          <span className="flex items-center gap-3">
            <CompanyAvatar name={job.company} size={40} />
            <span className="min-w-0">
              <span className="block truncate">{job.title}</span>
              <span className="block text-base font-normal text-muted" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{job.company}{job.location ? ` · ${job.location}` : ""}</span>
            </span>
          </span>
        }
        lead={
          <span className="flex flex-wrap items-center gap-2">
            <StateChip state={app.status} t={t} />
            {ev && <ScoreRing value={ev.global} size={36} label={scoreLabel(t, ev.global)} animate={false} />}
            {app.applied_at && <span className="text-sm">{fmt(w.alreadyApplied, { d: fmtDate(app.applied_at, locale) })}</span>}
          </span>
        }
        actions={<OutcomeButton id={id} pack={pack} />}
      />
      <ApplyWizard
        id={id}
        job={{ id: job.id, title: job.title, company: job.company, type: job.type }}
        ready={{
          evaluated: !!ev,
          cv: !!app.cv_md?.trim(),
          letter: !!app.cover_letter_md?.trim(),
          contact: contacts[0]?.name ?? null,
          deadline: job.deadline,
          manual: !/^https?:\/\//i.test(job.url),
          hasProfileCv: getCvSource().text.trim().length >= 50,
          savedAnswers: saved.filter((a) => a.answer.trim()).length,
        }}
        contacts={contacts}
        questions={detectQuestions(`${job.title}\n${job.description}`)}
        saved={saved}
        pack={pack}
        profile={{ name: profile.name }}
        initialStep={step}
      />
    </>
  );
}
