"use client";

import { useState, useTransition } from "react";
import { Flame, Pencil } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { saveWeeklyGoal } from "@/app/actions/insights";

/** Compact weekly-goal card (64px ring, remaining count, streak). Click the pencil to change the target. */
export function WeeklyGoal({ target, done, streak }: { target: number; done: number; streak: number }) {
  const { t } = useT();
  const m = t.insights2.today;
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(target);
  const [pending, start] = useTransition();
  const pct = Math.min(1, done / target);
  const r = 27;
  const c = 2 * Math.PI * r;
  const reached = done >= target;

  return (
    <div className="flex shrink-0 items-center gap-5 rounded-[14px] border border-line bg-surface py-3 pl-3 pr-[18px]">
      <span
        role="progressbar"
        aria-label={m.goal}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(done, target)}
        aria-valuetext={fmt(m.goalProgress, { done, n: target })}
        className="relative grid size-16 shrink-0 place-items-center"
      >
        <svg viewBox="0 0 64 64" width="64" height="64" className="-rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="7" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={reached ? "var(--success)" : "var(--accent)"}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            style={{ transition: "stroke-dasharray 1s cubic-bezier(.2,.7,.2,1)" }}
          />
        </svg>
        <span className="display absolute text-[1.1rem] leading-none" aria-hidden="true">
          {done}
          <span className="text-[0.7rem] font-medium text-muted">/{target}</span>
        </span>
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[0.9rem] font-semibold">
          {m.goal}
          <button type="button" className="grid size-6 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink" aria-label={m.editGoal} onClick={() => setEditing((e) => !e)}>
            <Pencil size={12} aria-hidden="true" />
          </button>
        </p>
        {editing ? (
          <form
            className="mt-1 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                await saveWeeklyGoal(value);
                setEditing(false);
                toast.success(m.goalSaved);
              });
            }}
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              required
              aria-label={m.goalLabel}
              className="input tabular !h-8 !w-16 !py-0 text-sm"
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              autoFocus
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending} aria-busy={pending}>{t.common.save}</button>
          </form>
        ) : (
          <p className="mt-0.5 text-[0.8rem] text-muted">{reached ? m.goalDone : fmt(m.goalMore, { n: target - done })}</p>
        )}
        <p className={`mt-1 inline-flex items-center gap-1.5 text-[0.78rem] font-semibold ${streak ? "text-saffron" : "text-muted"}`}>
          <Flame size={13} aria-hidden="true" />
          {streak ? fmt(m.streak, { n: streak }) : m.noStreak}
        </p>
      </div>
    </div>
  );
}
