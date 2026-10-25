"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/kit/dialog";
import { useToast } from "@/components/kit/toast";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { INTERVIEW_KINDS, type AppState, type Interview } from "@/lib/types";
import { moveApplication, saveInterview, undoMove } from "@/app/actions/applications";
import { logOutcome } from "@/app/actions/apply";
import { useRun } from "./use-run";

const pad = (n: number) => String(n).padStart(2, "0");
/** Tomorrow 10:00, local, as a datetime-local value. */
export function defaultSlot(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

export const OUTCOMES = ["", "positive", "neutral", "negative"] as const;

/** Add or edit an interview. */
export function InterviewDialog({
  appId,
  open,
  onClose,
  initial,
  title,
  description,
}: {
  appId: number;
  open: boolean;
  onClose: () => void;
  initial: Partial<Interview> & { starts_at: string };
  title: string;
  description?: string;
}) {
  const { t } = useT();
  const a = t.apps2.interviews;
  const [pending, run] = useRun();
  const formId = `iv-form-${appId}-${initial.id ?? "new"}`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t.common.cancel}</button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={pending} aria-busy={pending}>{t.common.save}</button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const f = {
            starts_at: String(fd.get("starts_at") ?? ""),
            duration_min: Number(fd.get("duration_min") ?? 45),
            kind: String(fd.get("kind") ?? "technical"),
            location: String(fd.get("location") ?? ""),
            notes: String(fd.get("notes") ?? ""),
            outcome: String(fd.get("outcome") ?? ""),
          };
          run(() => saveInterview(appId, f, initial.id), a.saved, onClose);
        }}
      >
        <div>
          <label className="label" htmlFor={`${formId}-when`}>{a.when}</label>
          <input id={`${formId}-when`} name="starts_at" type="datetime-local" required className="input" defaultValue={initial.starts_at} />
        </div>
        <div>
          <label className="label" htmlFor={`${formId}-dur`}>{a.duration}</label>
          <input id={`${formId}-dur`} name="duration_min" type="number" min={5} max={600} step={5} className="input tabular" defaultValue={initial.duration_min ?? 45} />
        </div>
        <div>
          <label className="label" htmlFor={`${formId}-kind`}>{a.kind}</label>
          <select id={`${formId}-kind`} name="kind" className="input" defaultValue={initial.kind ?? "technical"}>
            {INTERVIEW_KINDS.map((k) => (
              <option key={k} value={k}>{a.kinds[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${formId}-out`}>{a.outcome}</label>
          <select id={`${formId}-out`} name="outcome" className="input" defaultValue={initial.outcome ?? ""}>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>{a.outcomes[o || "pending"]}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`${formId}-loc`}>{a.location}</label>
          <input id={`${formId}-loc`} name="location" className="input" maxLength={300} defaultValue={initial.location ?? ""} placeholder={a.locationPh} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`${formId}-notes`}>{a.notes}</label>
          <textarea id={`${formId}-notes`} name="notes" className="input !min-h-24" maxLength={4000} defaultValue={initial.notes ?? ""} />
        </div>
      </form>
    </Dialog>
  );
}

function RejectDialog({ appId, title, onClose }: { appId: number; title: string; onClose: () => void }) {
  const { t } = useT();
  const s = t.apps2.stage;
  const [reason, setReason] = useState("");
  const [pending, run] = useRun();
  return (
    <Dialog
      open
      onClose={onClose}
      title={s.rejectTitle}
      description={fmt(s.rejectDesc, { title })}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{s.skip}</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !reason.trim()}
            aria-busy={pending}
            onClick={() => run(() => logOutcome(appId, "rejected", reason.trim(), ""), s.reasonSaved, onClose)}
          >
            {t.common.save}
          </button>
        </>
      }
    >
      <label className="label" htmlFor="reject-reason">{s.reasonLabel} <span className="text-muted font-normal">({t.common.optional})</span></label>
      <textarea id="reject-reason" className="input !min-h-24" maxLength={1500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={s.reasonPh} />
    </Dialog>
  );
}

export interface MovableItem {
  id: number;
  status: AppState;
  title: string;
}

/**
 * Stage changes with side effects shared by the board and the workspace stepper:
 * toast with Undo, interview scheduling dialog, optional rejection reason.
 */
// The toasts announce the move, its undo and errors (they sit in live regions): announcing here too read each move twice.
export function useStageMove(onOptimistic?: (id: number, status: AppState) => void) {
  const { t } = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [schedule, setSchedule] = useState<{ item: MovableItem; slot: string } | null>(null);
  const [reject, setReject] = useState<MovableItem | null>(null);

  const move = (item: MovableItem, to: AppState, onDone?: () => void, sent?: { channel: string; reference: string }) => {
    if (item.status === to) return;
    start(async () => {
      onOptimistic?.(item.id, to);
      const r = await moveApplication(item.id, to, sent);
      if (!r.ok) {
        toast.error(t.common.error, r.error);
        return;
      }
      const msg = fmt(t.apps2.board.moved, { title: item.title, col: t.states[to] });
      toast.success(msg, to === "applied" && r.snapshot.reminderId ? t.apps2.board.followupCreated : undefined, {
        label: t.apps2.board.undo,
        onClick: () =>
          start(async () => {
            onOptimistic?.(item.id, item.status);
            const u = await undoMove(item.id, r.snapshot);
            if (u.ok) {
              toast.info(t.apps2.board.undone);
            } else toast.error(t.common.error, u.error);
          }),
      });
      onDone?.();
      if (r.askInterview) setSchedule({ item, slot: defaultSlot() });
      if (r.askReason) setReject(item);
    });
  };

  const node = (
    <>
      {schedule && (
        <InterviewDialog
          appId={schedule.item.id}
          open
          onClose={() => setSchedule(null)}
          initial={{ starts_at: schedule.slot }}
          title={t.apps2.stage.scheduleTitle}
          description={fmt(t.apps2.stage.scheduleDesc, { title: schedule.item.title })}
        />
      )}
      {reject && <RejectDialog appId={reject.id} title={reject.title} onClose={() => setReject(null)} />}
    </>
  );
  return { move, node, pending };
}
