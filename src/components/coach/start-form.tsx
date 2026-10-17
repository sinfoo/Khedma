"use client";

import { useActionState, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { TRACKS } from "@/lib/coach/bank";
import { KINDS, LENGTHS } from "@/lib/coach/logic";
import { startSession } from "@/app/actions/coach";

export interface AppOption {
  id: number;
  title: string;
  company: string;
  /** Next interview, when one is scheduled. */
  interviewAt?: string | null;
}

/** Start in three taps: a suggested application, the kind of session, then Start. */
export function StartForm({ apps, preselect, locale, suggestedLabel }: { apps: AppOption[]; preselect: number | null; locale: "fr" | "en"; suggestedLabel?: string }) {
  const { t } = useT();
  const c = t.coach2;
  const s = c.start;
  const [state, action, pending] = useActionState(startSession, null);
  const pre = preselect !== null && apps.some((a) => a.id === preselect) ? preselect : apps[0]?.id ?? null;
  const [source, setSource] = useState<"app" | "generic">(pre !== null ? "app" : "generic");
  const [appId, setAppId] = useState<number | null>(pre);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("mixed");
  const [lang, setLang] = useState<"fr" | "en">(locale);
  const [length, setLength] = useState<(typeof LENGTHS)[number]>(8);
  const [level, setLevel] = useState<"1" | "2" | "3">("2");
  const [more, setMore] = useState(false);
  const app = apps.find((a) => a.id === appId) ?? null;
  const minutes = Math.round(length * 2.5);
  const title = source === "app" && app ? `${s.mockFor} ${app.company} · ${app.title}` : s.heading;

  return (
    <form action={action} className="card relative overflow-hidden p-[22px]" aria-describedby={state?.error ? "start-err" : undefined}>
      <p className="eyebrow text-saffron">{suggestedLabel ?? s.suggested}</p>
      <h2 className="mt-1.5 line-clamp-2 text-[1.5rem] leading-[1.2] tracking-[-0.02em]">{title}</h2>
      <p className="mt-1.5 max-w-[48ch] text-[0.9rem] text-ink-2">{s.lead}</p>

      <input type="hidden" name="source" value={source} />
      {source === "app" && app && <input type="hidden" name="application" value={app.id} />}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="length" value={length} />
      <input type="hidden" name="level" value={level} />

      <div role="radiogroup" aria-label={s.kind} className="mt-[18px] grid gap-2.5 sm:grid-cols-3">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-xl border p-3 text-left transition-colors ${kind === k ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong"}`}
          >
            <span className="block text-sm font-semibold text-ink">{c.kinds[k]}</span>
            <span className="mt-0.5 block text-[0.75rem] text-muted">{c.kindHints[k]}</span>
          </button>
        ))}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2 text-[0.82rem] text-muted">
        <span role="radiogroup" aria-label={s.lang} className="seg seg-sm">
          {(["fr", "en"] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} className={`seg-btn ${lang === l ? "on" : ""}`} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </span>
        <span role="radiogroup" aria-label={s.length} className="seg seg-sm">
          {LENGTHS.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={length === n} className={`seg-btn ${length === n ? "on" : ""}`} onClick={() => setLength(n)}>
              {n} q{length === n ? ` · ${Math.round(n * 2.5)} min` : ""}
            </button>
          ))}
        </span>
        <span role="radiogroup" aria-label={s.level} className="seg seg-sm">
          {(["1", "2", "3"] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={level === l} className={`seg-btn ${level === l ? "on" : ""}`} onClick={() => setLevel(l)}>
              {c.levels[l]}
            </button>
          ))}
        </span>
      </div>

      {more && (
        <div className="mt-3.5 rounded-xl border border-line p-3" style={{ animation: "pop .18s ease both" }}>
          <div className="seg seg-sm mb-2.5">
            <button type="button" className={`seg-btn ${source === "app" ? "on" : ""}`} disabled={!apps.length} onClick={() => setSource("app")}>{s.fromApp}</button>
            <button type="button" className={`seg-btn ${source === "generic" ? "on" : ""}`} onClick={() => setSource("generic")}>{s.generic}</button>
          </div>
          {source === "app" ? (
            apps.length ? (
              <>
                <label htmlFor="coach-app" className="label">{s.application}</label>
                <select id="coach-app" className="input !h-9 !py-0 text-sm" value={appId ?? ""} onChange={(e) => setAppId(Number(e.target.value) || null)}>
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>{a.title} — {a.company}</option>
                  ))}
                </select>
                <p className="hint">{s.postingNote}</p>
              </>
            ) : (
              <p className="hint">{s.noApps}</p>
            )
          ) : (
            <fieldset>
              <legend className="label">{s.track}</legend>
              <div className="flex flex-wrap gap-1.5">
                {TRACKS.map((tr, i) => (
                  <label key={tr} className="chip min-h-8 cursor-pointer !px-3 has-checked:!border-transparent has-checked:!bg-accent-soft has-checked:!text-accent-text">
                    <input type="radio" name="track" value={tr} defaultChecked={i === 1} className="sr-only" />
                    {c.tracks[tr]}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {state?.error && (
        <p id="start-err" role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{s.error}</p>
      )}

      <div className="mt-[18px] flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-saffron !h-[46px] !rounded-xl !px-5 !text-base" disabled={pending || (source === "app" && !app)} aria-busy={pending}>
          {pending ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
          {pending ? s.submitting : fmt(s.startMin, { n: minutes })}
        </button>
        <button type="button" className="text-[0.85rem] font-semibold text-accent-text" aria-expanded={more} onClick={() => setMore((v) => !v)}>
          {s.another}
        </button>
      </div>
    </form>
  );
}
