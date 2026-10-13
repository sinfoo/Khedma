"use client";

import { useActionState, useState } from "react";
import { Briefcase, Compass, Loader2, Play } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { TRACKS } from "@/lib/coach/bank";
import { KINDS, LENGTHS } from "@/lib/coach/logic";
import { startSession } from "@/app/actions/coach";

export interface AppOption {
  id: number;
  title: string;
  company: string;
}

// Radio rendered as a selectable tile; the native input keeps keyboard and screen-reader behaviour.
function Choice({ name, value, defaultChecked, checked, onChange, disabled, children, className = "" }: {
  disabled?: boolean;
  name: string;
  value: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`relative flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm transition-colors hover:border-line-strong has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)] ${className}`}
    >
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} checked={checked} onChange={onChange} disabled={disabled} className="sr-only" />
      {children}
    </label>
  );
}

export function StartForm({ apps, preselect, locale }: { apps: AppOption[]; preselect: number | null; locale: "fr" | "en" }) {
  const { t } = useT();
  const c = t.coach2;
  const [state, action, pending] = useActionState(startSession, null);
  const hasPre = preselect !== null && apps.some((a) => a.id === preselect);
  const [source, setSource] = useState<"app" | "generic">(hasPre ? "app" : "generic");

  return (
    <form action={action} className="space-y-6" aria-describedby={state?.error ? "start-err" : undefined}>
      <fieldset>
        <legend className="label">{c.start.basedOn}</legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          <Choice name="source" value="app" checked={source === "app"} onChange={() => setSource("app")} disabled={!apps.length}>
            <Briefcase size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-text" />
            <span className="font-medium">{c.start.fromApp}</span>
          </Choice>
          <Choice name="source" value="generic" checked={source === "generic"} onChange={() => setSource("generic")}>
            <Compass size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-text" />
            <span className="font-medium">{c.start.generic}</span>
          </Choice>
        </div>
      </fieldset>

      {source === "app" ? (
        <div>
          <label htmlFor="coach-app" className="label">{c.start.application}</label>
          {apps.length ? (
            <>
              <select id="coach-app" name="application" className="input mt-1.5" required defaultValue={hasPre ? String(preselect) : ""}>
                <option value="" disabled>{c.start.chooseApp}</option>
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} — {a.company}
                  </option>
                ))}
              </select>
              <p className="hint">{c.start.postingNote}</p>
            </>
          ) : (
            <p className="hint">{c.start.noApps}</p>
          )}
        </div>
      ) : (
        <fieldset>
          <legend className="label">{c.start.track}</legend>
          <div className="mt-1.5 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {TRACKS.map((tr, i) => (
              <Choice key={tr} name="track" value={tr} defaultChecked={i === 2}>
                <span className="font-medium">{c.tracks[tr]}</span>
              </Choice>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="label">{c.start.kind}</legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <Choice key={k} name="kind" value={k} defaultChecked={k === "mixed"}>
              <span>
                <span className="block font-medium">{c.kinds[k]}</span>
                <span className="block text-xs text-muted">{c.kindHints[k]}</span>
              </span>
            </Choice>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-3">
        <fieldset>
          <legend className="label">{c.start.lang}</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {(["fr", "en"] as const).map((l) => (
              <Choice key={l} name="lang" value={l} defaultChecked={l === locale} className="justify-center">
                <span className="font-medium">{c.langs[l]}</span>
              </Choice>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">{c.start.length}</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {LENGTHS.map((n) => (
              <Choice key={n} name="length" value={String(n)} defaultChecked={n === 8} className="justify-center">
                <span className="mono font-semibold" aria-hidden="true">{n}</span>
                <span className="sr-only">{fmt(c.start.lengthOpt, { n })}</span>
              </Choice>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">{c.start.level}</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {(["1", "2", "3"] as const).map((l) => (
              <Choice key={l} name="level" value={l} defaultChecked={l === "2"} className="justify-center !px-1.5">
                <span className="flex flex-col items-center leading-tight">
                  <span aria-hidden="true" className="tracking-[-0.1em] text-accent-text">{"●".repeat(Number(l))}{"○".repeat(3 - Number(l))}</span>
                  <span className="text-[0.7rem] font-medium">{c.levels[l]}</span>
                </span>
              </Choice>
            ))}
          </div>
        </fieldset>
      </div>

      {state?.error && (
        <p id="start-err" role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {c.start.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-lg w-full sm:w-auto" disabled={pending || (source === "app" && !apps.length)} aria-busy={pending}>
        {pending ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        {pending ? c.start.submitting : c.start.submit}
      </button>
    </form>
  );
}
