"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { JobType } from "@/lib/types";
import type { DetectedQuestion } from "@/lib/apply/questions";
import { STEPS, type Pack, type SavedAnswer, type Step } from "@/lib/apply/types";
import { Readiness, type Ready } from "./readiness";
import { AnswersStep } from "./answers";
import { OutreachStep } from "./outreach";
import { SubmitStep } from "./submit";

export interface WizardProps {
  id: number;
  job: { id: number; title: string; company: string; type: JobType };
  ready: Ready;
  contacts: { id: number; name: string; email: string }[];
  questions: DetectedQuestion[];
  saved: SavedAnswer[];
  pack: Pack;
  profile: { name: string };
  initialStep: Step;
}

export function ApplyWizard(p: WizardProps) {
  const { t } = useT();
  const w = t.apply2.wizard;
  const router = useRouter();
  const [step, setStep] = useState<Step>(p.initialStep);
  const idx = STEPS.indexOf(step);
  const go = (s: Step) => {
    setStep(s);
    router.replace(`/app/apply/${p.id}?step=${s}`, { scroll: false });
  };
  const doneSteps: Record<Step, boolean> = {
    ready: p.ready.evaluated && (p.ready.cv || p.ready.hasProfileCv),
    answers: p.saved.length > 0,
    outreach: false,
    submit: !!p.pack.submitted_at,
  };

  return (
    <div className="space-y-6">
      <nav aria-label={w.stepsLabel} className="no-print">
        <ol className="grid gap-1.5 sm:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" onClick={() => go(s)} aria-current={s === step ? "step" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${s === step ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:bg-surface-2 hover:text-ink"}`}>
                <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular ${doneSteps[s] ? "bg-success-soft text-success" : s === step ? "bg-accent text-accent-ink" : "bg-surface-2"}`} aria-hidden="true">
                  {doneSteps[s] ? <Check size={13} /> : i + 1}
                </span>
                <span className="font-medium">{w.steps[s]}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div key={step} className="fade">
        {step === "ready" && <Readiness id={p.id} jobId={p.job.id} ready={p.ready} />}
        {step === "answers" && <AnswersStep id={p.id} questions={p.questions} saved={p.saved} />}
        {step === "outreach" && <OutreachStep id={p.id} contacts={p.contacts} />}
        {step === "submit" && (
          <SubmitStep id={p.id} job={p.job} pack={p.pack} answersCount={p.saved.filter((a) => a.answer.trim()).length} profile={p.profile}
            contactEmail={p.contacts.find((c) => c.email)?.email ?? ""} hasLetter={p.ready.letter} />
        )}
      </div>

      <div className="flex items-center justify-between no-print">
        <button type="button" className="btn btn-ghost" disabled={idx === 0} onClick={() => go(STEPS[idx - 1])}><ArrowLeft size={16} aria-hidden="true" />{w.prev}</button>
        {idx < STEPS.length - 1 && <button type="button" className="btn btn-primary" onClick={() => go(STEPS[idx + 1])}>{w.next}<ArrowRight size={16} aria-hidden="true" /></button>}
      </div>
    </div>
  );
}
