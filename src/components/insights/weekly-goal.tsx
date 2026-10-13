"use client";

import { useState, useTransition } from "react";
import { Flame, Pencil } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { saveWeeklyGoal } from "@/app/actions/insights";

export function WeeklyGoal({ target, done, streak }: { target: number; done: number; streak: number }) {
  const { t } = useT();
  const m = t.insights2.today;
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(target);
  const [pending, start] = useTransition();
  const pct = Math.min(1, done / target);
  const r = 38;
  const c = 2 * Math.PI * r;
  const reached = done >= target;

  return (
    <div>
      <div className="flex items-center gap-4">
        <div
          role="progressbar"
          aria-label={m.goal}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(done, target)}
          aria-valuetext={fmt(m.goalProgress, { done, n: target })}
          className="relative grid size-24 shrink-0 place-items-center"
        >
          <svg viewBox="0 0 96 96" className="size-24 -rotate-90" aria-hidden="true">
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="9" />
            <circle
              cx="48"
              cy="48"
              r={r}
              fill="none"
              stroke={reached ? "var(--success)" : "var(--accent)"}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${c * pct} ${c}`}
              style={{ transition: "stroke-dasharray .6s cubic-bezier(.2,.7,.2,1)" }}
            />
          </svg>
          <span className="absolute text-center leading-none" aria-hidden="true">
            <span className="display tabular text-2xl">{done}</span>
            <span className="text-sm text-muted tabular">/{target}</span>
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-medium">{fmt(m.goalText, { n: target })}</p>
          <p className={`mt-0.5 text-sm ${reached ? "text-success" : "text-muted"}`}>{reached ? m.goalReached : fmt(m.goalProgress, { done, n: target })}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm">
            <Flame size={15} aria-hidden="true" className={streak ? "text-saffron" : "text-muted"} />
            <span className={streak ? "" : "text-muted"}>{streak ? fmt(m.streak, { n: streak }) : m.noStreak}</span>
          </p>
        </div>
      </div>

      {editing ? (
        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              await saveWeeklyGoal(value);
              setEditing(false);
              toast.success(m.goalSaved);
            });
          }}
        >
          <div className="flex-1">
            <label htmlFor="goal-n" className="label">{m.goalLabel}</label>
            <input
              id="goal-n"
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              required
              className="input tabular"
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>{t.common.save}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setEditing(false); setValue(target); }}>{t.common.cancel}</button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm mt-3 -ml-2" onClick={() => setEditing(true)}>
          <Pencil size={14} aria-hidden="true" /> {m.editGoal}
        </button>
      )}
    </div>
  );
}
