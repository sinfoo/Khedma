"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleDashed, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { Progress } from "@/components/kit";
import type { ChecklistItem } from "@/lib/repo/apps";
import { saveNotes, setNextAction, toggleChecklist } from "@/app/actions/applications";
import { useRun } from "./use-run";

export function Checklist({ id, items, compact = false, title }: { id: number; items: ChecklistItem[]; compact?: boolean; title?: string }) {
  const { t } = useT();
  const o = t.apps2.overview;
  const [pending, run] = useRun();
  const done = items.filter((i) => i.done).length;
  return (
    <section className="card p-4" aria-labelledby="ck-h">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 id="ck-h" className="card-title text-[0.9rem]">{title ?? o.checklist}</h2>
        <span className="mono text-xs text-muted tabular">{fmt(o.progress, { done, total: items.length })}</span>
      </div>
      {!compact && <Progress value={done} max={items.length} label={o.checklist} tone={done === items.length ? "success" : "accent"} />}
      <ul className={`flex flex-col gap-2 text-[0.82rem] ${compact ? "" : "mt-3"}`} aria-busy={pending}>
        {items.map((it) => (
          <li key={it.key}>
            <label className={`flex items-center gap-2 ${it.auto ? "" : "cursor-pointer"}`}>
              <input type="checkbox" className="peer sr-only" checked={it.done} disabled={it.auto || it.key === "applied" || pending} onChange={(e) => run(() => toggleChecklist(id, it.key, e.target.checked))} />
              <span
                aria-hidden="true"
                className={`grid size-[18px] shrink-0 place-items-center rounded-md border text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)] ${it.done ? "border-success bg-success" : "border-line-strong bg-surface"}`}
              >
                {it.done && <Check size={11} />}
              </span>
              <span className={`flex-1 ${it.done ? "text-muted line-through decoration-1" : "text-ink-2"}`}>{o.items[it.key]}</span>
              {it.auto && (
                <span className="text-[0.68rem] font-semibold text-muted" title={o.autoHint}>
                  {o.auto}
                </span>
              )}
              {!it.auto && !it.done && <CircleDashed size={13} aria-hidden="true" className="text-muted" />}
            </label>
          </li>
        ))}
      </ul>
      {!compact && <p className="hint mt-2">{o.autoHint}</p>}
    </section>
  );
}

/** Notes with debounced autosave and a visible save status. */
export function NotesCard({ id, initialNotes, nextAction, overdue }: { id: number; initialNotes: string; nextAction: string | null; overdue: boolean }) {
  const { t } = useT();
  const o = t.apps2.overview;
  const [notes, setNotes] = useState(initialNotes);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(notes);
  const [pending, run] = useRun();

  const flush = async (value: string) => {
    setState("saving");
    try {
      const r = await saveNotes(id, value);
      setState(r.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  };

  // Save pending notes when leaving the tab/page.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void saveNotes(id, latest.current);
      }
    },
    [id],
  );

  return (
    <section className="card p-5" aria-labelledby="notes-h">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="next-action">{o.nextAction}</label>
          <div className="flex items-center gap-2">
            <input
              id="next-action"
              type="date"
              className={`input max-w-52 ${overdue ? "!border-danger" : ""}`}
              defaultValue={nextAction ?? ""}
              aria-describedby="next-action-hint"
              onChange={(e) => run(() => setNextAction(id, e.target.value || null), o.nextActionSaved)}
              disabled={pending}
            />
            {overdue && <span className="chip chip-danger">{o.overdue}</span>}
          </div>
          <p id="next-action-hint" className="hint mt-1">{o.nextActionHint}</p>
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <h2 id="notes-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
            <label htmlFor="app-notes">{o.notes}</label>
          </h2>
          <span role="status" className={`inline-flex items-center gap-1 text-xs ${state === "error" ? "text-danger" : "text-muted"}`}>
            {state === "saving" && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
            {state === "saving" ? o.saving : state === "saved" ? o.saved : state === "error" ? o.saveFailed : o.autosave}
          </span>
        </div>
        <textarea
          id="app-notes"
          className="input !min-h-48"
          value={notes}
          maxLength={10000}
          placeholder={o.notesPh}
          onChange={(e) => {
            const v = e.target.value;
            setNotes(v);
            latest.current = v;
            setState("idle");
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              timer.current = null;
              void flush(v);
            }, 800);
          }}
          onBlur={() => {
            if (timer.current) {
              clearTimeout(timer.current);
              timer.current = null;
              void flush(latest.current);
            }
          }}
        />
      </div>
    </section>
  );
}
