"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Bookmark, Check, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { Progress } from "@/components/kit";
import { useToast } from "@/components/kit/toast";
import { TRACK_STATUSES, type TrackStatus, type Tracking } from "@/lib/bourses/model";
import { removeBourse, saveBourse, setBourseNotes, setBourseStatus, tickBourseDoc, type BourseResult } from "@/app/actions/bourses";

/**
 * The student's follow-up of one scholarship: status, the documents to prepare and free notes.
 * Ticking a document or saving notes starts the tracking on its own.
 */
export function Tracker({ id, tracking, docs }: { id: string; tracking: Tracking | null; docs: { key: string; label: string; hint?: string }[] }) {
  const { t } = useT();
  const m = t.bourses2;
  const toast = useToast();
  const [pending, start] = useTransition();
  const [state, setState] = useOptimistic(tracking);
  const [notesSaved, setNotesSaved] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  const removed = useRef(false);

  // After "Stop tracking" its button is gone: hand the focus to the button that replaces it.
  useEffect(() => {
    if (!tracking && removed.current) saveRef.current?.focus();
    removed.current = false;
  }, [tracking]);

  const run = (next: Tracking | null, action: () => Promise<BourseResult>, after?: () => void) =>
    start(async () => {
      setState(next);
      const res = await action();
      if (!res.ok) toast.error(m.track.failed);
      else after?.();
    });
  const base: Tracking = state ?? { item: id, status: "saved", notes: "", checklist: {}, created_at: "", updated_at: "" };
  const ready = docs.filter((d) => base.checklist[d.key]).length;

  return (
    <div className="grid gap-5">
      <div>
        {state ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label={m.track.status} className="seg flex-wrap">
              {TRACK_STATUSES.map((s: TrackStatus) => (
                <button key={s} type="button" aria-pressed={state.status === s} className={`seg-btn ${state.status === s ? "on" : ""}`} onClick={() => state.status !== s && run({ ...state, status: s }, () => setBourseStatus(id, s))}>
                  {m.statuses[s]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(m.track.removeConfirm)) return;
                removed.current = true;
                run(null, () => removeBourse(id));
              }}
            >
              {m.track.remove}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">{m.track.notTracked}</p>
            <button ref={saveRef} type="button" className="btn btn-primary btn-sm" disabled={pending} aria-busy={pending} onClick={() => run(base, () => saveBourse(id))}>
              {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Bookmark size={14} aria-hidden="true" />} {m.track.start}
            </button>
          </div>
        )}
      </div>

      <fieldset>
        <legend className="card-title">{m.track.docs}</legend>
        <p className="mt-1 text-sm text-muted">{m.track.docsLead}</p>
        <div className="mt-3 flex items-center gap-3">
          <Progress value={ready} max={docs.length} label={fmt(m.track.docsProgress, { done: ready, n: docs.length })} tone="success" />
          <span className="mono shrink-0 text-xs text-muted" aria-hidden="true">{ready}/{docs.length}</span>
        </div>
        <ul className="mt-3 grid gap-1">
          {docs.map((d) => {
            const on = !!base.checklist[d.key];
            return (
              <li key={d.key}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                    checked={on}
                    onChange={(e) => {
                      const v = e.target.checked;
                      run({ ...base, checklist: { ...base.checklist, [d.key]: v } }, () => tickBourseDoc(id, d.key, v));
                    }}
                  />
                  <span className={on ? "text-muted line-through" : "text-ink-2"}>
                    {d.label}
                    {d.hint && <span className="block text-[0.78rem] text-muted no-underline">{d.hint}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const notes = String(new FormData(e.currentTarget).get("notes") ?? "");
          setNotesSaved(false);
          run({ ...base, notes }, () => setBourseNotes(id, notes), () => setNotesSaved(true));
        }}
      >
        <label htmlFor="bourse-notes" className="card-title block">{m.track.notes}</label>
        <textarea id="bourse-notes" name="notes" defaultValue={tracking?.notes ?? ""} maxLength={5000} placeholder={m.track.notesPh} className="input mt-2" onInput={() => setNotesSaved(false)} />
        <div className="mt-2 flex items-center gap-3">
          <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>
            {notesSaved && <Check size={14} aria-hidden="true" />} {m.track.saveNotes}
          </button>
          <span role="status" className="text-sm text-muted">{notesSaved ? m.track.saved : ""}</span>
        </div>
      </form>
    </div>
  );
}
