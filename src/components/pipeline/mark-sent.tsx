"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CircleCheck, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { Dialog } from "@/components/kit/dialog";
import { CHANNELS, type Channel } from "@/lib/apply/types";
import type { AppState } from "@/lib/types";
import { useStageMove } from "./stage";

/**
 * "I've sent it": the one place an application is marked as sent. Asks how it went out (channel, optional
 * reference), warns when the CV or letter is missing, then moves the card through the shared stage move
 * (toast + undo, follow-up reminder, answers kept as sent) and opens the after-step.
 */
export function MarkSentButton({
  id, status, title, missing, afterHref, channel: initial, answers, unfilled = 0, className = "btn btn-saffron !h-10",
}: {
  id: number;
  status: AppState;
  title: string;
  missing: ("cv" | "letter")[];
  afterHref: string;
  /** Best guess from the posting: "email" when it only gives an address. */
  channel: Channel;
  /** Form answers that will be stored as sent, and how many still hold a [placeholder]. */
  answers: number;
  unfilled?: number;
  className?: string;
}) {
  const { t } = useT();
  const F = t.apps2.flow;
  const s = t.apply2.submit;
  const router = useRouter();
  const { move, node, pending } = useStageMove();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>(initial);
  const [reference, setReference] = useState("");
  const docs = missing.map((k) => (k === "cv" ? F.packCv : F.packLetter)).join(" + ");
  const send = () => move({ id, status, title }, "applied", () => { setOpen(false); router.push(afterHref); }, { channel, reference: reference.trim() });
  return (
    <>
      {node}
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <CircleCheck size={14} aria-hidden="true" /> {F.markApplied}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={F.markApplied}
        description={s.lead}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>{t.common.cancel}</button>
            <button type="button" className="btn btn-saffron" disabled={pending} aria-busy={pending} onClick={send}>
              {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CircleCheck size={14} aria-hidden="true" />} {s.apply}
            </button>
          </>
        }
      >
        {missing.length > 0 && (
          <p className="mb-4 flex items-start gap-2 rounded-xl bg-saffron-soft p-3 text-sm" role="note">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-saffron" aria-hidden="true" />
            {fmt(F.missingDocs, { docs })}
          </p>
        )}
        {unfilled > 0 && (
          <p className="mb-4 flex items-start gap-2 rounded-xl bg-saffron-soft p-3 text-sm" role="note">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-saffron" aria-hidden="true" />
            {fmt(F.unfilledAnswers, { n: unfilled })}
          </p>
        )}
        <fieldset className="mb-4">
          <legend className="label">{s.channel}</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {CHANNELS.map((c) => (
              <label key={c} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)] has-[:focus-visible]:[outline-style:solid] ${channel === c ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"}`}>
                <input type="radio" name="sent-channel" value={c} checked={channel === c} onChange={() => setChannel(c)} className="size-4 accent-[var(--accent)]" />
                {s.channels[c]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="label" htmlFor="sent-ref">{s.reference} <span className="font-normal text-muted">({t.common.optional})</span></label>
        <input id="sent-ref" className="input" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
        <p className="mt-3 text-sm text-muted">{answers ? fmt(s.snapshot, { n: answers }) : s.snapshotNone}</p>
      </Dialog>
    </>
  );
}
