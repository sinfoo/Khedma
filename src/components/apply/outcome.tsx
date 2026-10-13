"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { Dialog } from "@/components/kit/dialog";
import { fmtDate } from "@/components/ui";
import { useRun } from "@/components/pipeline/use-run";
import { OUTCOMES, type Outcome, type Pack } from "@/lib/apply/types";
import { logOutcome } from "@/app/actions/apply";

export function OutcomeButton({ id, pack: initial }: { id: number; pack: Pack }) {
  const { t, locale } = useT();
  const o = t.apply2.outcome;
  const [pack, setPack] = useState(initial);
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(pack.outcome ?? "rejected");
  const [reason, setReason] = useState(pack.outcome_reason);
  const [lesson, setLesson] = useState(pack.lesson);
  const [pending, run] = useRun();
  const formId = "outcome-form";
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Flag size={16} aria-hidden="true" />
        {pack.outcome ? fmt(o.current, { o: o.outcomes[pack.outcome], d: fmtDate(pack.outcome_at, locale) }) : o.open}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={o.title} description={o.lead}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>{t.common.cancel}</button>
            <button type="submit" form={formId} className="btn btn-primary" disabled={pending} aria-busy={pending}>{o.save}</button>
          </>
        }>
        <form id={formId} className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => logOutcome(id, outcome, reason, lesson), o.saved, (r) => { setPack(r.pack); setOpen(false); }); }}>
          <fieldset>
            <legend className="label">{o.outcome}</legend>
            <div className="grid gap-1.5">
              {OUTCOMES.map((k) => (
                <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)] has-[:focus-visible]:[outline-style:solid] ${outcome === k ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"}`}>
                  <input type="radio" name="outcome" value={k} checked={outcome === k} onChange={() => setOutcome(k)} className="size-4 accent-[var(--accent)]" />
                  {o.outcomes[k]}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="oc-reason">{o.reason}</label>
            <input id="oc-reason" className="input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="oc-lesson">{o.lesson}</label>
            <textarea id="oc-lesson" className="input min-h-24 w-full resize-y" value={lesson} maxLength={500} placeholder={o.lessonPlaceholder} onChange={(e) => setLesson(e.target.value)} />
          </div>
        </form>
      </Dialog>
    </>
  );
}
