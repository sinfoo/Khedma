"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { EngineChip } from "@/components/ui";
import { useRun } from "@/components/pipeline/use-run";
import type { FormFields } from "@/lib/apply/fields";
import { INTRO_LENGTHS, PITCH_MAX, PROJECT_MAX } from "@/lib/apply/fields";
import { generateFormFields } from "@/app/actions/apply";

const sans = { fontFamily: "var(--font-sans)", letterSpacing: 0 } as const;

/** "Champs de formulaire": self-intro ×3 lengths, project entries, pitch variants — with live counts and copy buttons. */
export function FieldsSection({ id, initial, hasCv }: { id: number; initial: FormFields | null; hasCv: boolean }) {
  const { t } = useT();
  const f = t.apply2.fields;
  const [fields, setFields] = useState(initial);
  const [gen, run] = useRun();
  return (
    <section className="card p-5 rise" aria-labelledby="fields-h">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="fields-h" className="text-base font-semibold" style={sans}>{f.title}</h2>
          <p className="text-sm text-muted">{f.lead}</p>
        </div>
        <div className="flex items-center gap-2">
          {fields && <EngineChip engine={fields.engine} t={t} />}
          <button type="button" className="btn btn-primary btn-sm" disabled={gen || !hasCv} aria-busy={gen} onClick={() => run(() => generateFormFields(id), undefined, (r) => setFields(r.fields))}>
            {gen ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}{gen ? t.common.generating : fields ? t.common.regenerate : f.generate}
          </button>
        </div>
      </div>
      {!hasCv && <p className="hint">{f.noCv}</p>}
      <div aria-live="polite">
        {!fields ? (
          gen ? <div className="space-y-2" aria-hidden="true">{[90, 70, 95].map((w, i) => <div key={i} className="skeleton h-4" style={{ width: `${w}%` }} />)}</div>
            : hasCv && <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{f.empty}</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold" style={sans}>{f.intro}</h3>
              <ul className="mt-2 space-y-3">
                {INTRO_LENGTHS.map((max) => {
                  const it = fields.intros.find((i) => i.max === max);
                  return it ? <li key={max}><Field label={fmt(f.introLen, { n: max })} text={it.text} max={max} id={`intro-${max}`} /></li> : null;
                })}
              </ul>
            </div>
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold" style={sans}>{f.projects}</h3>
                <ul className="mt-2 space-y-3">
                  {fields.projects.map((p, i) => <li key={`${p.title}-${i}`}><Field label={p.title} text={p.text} max={PROJECT_MAX} id={`proj-${i}`} /></li>)}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={sans}>{f.pitches}</h3>
                <ul className="mt-2 space-y-3">
                  {fields.pitches.map((p, i) => <li key={i}><Field label={`#${i + 1}`} text={p} max={PITCH_MAX} id={`pitch-${i}`} /></li>)}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, text: initial, max, id }: { label: string; text: string; max: number; id: string }) {
  const { t } = useT();
  const f = t.apply2.fields;
  const [text, setText] = useState(initial);
  const [copied, setCopied] = useState(false);
  const over = text.length > max;
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="truncate text-xs font-medium text-ink-2">{label}</label>
        <span className={`text-xs tabular ${over ? "text-danger" : "text-muted"}`} aria-live="polite">{fmt(f.counter, { n: text.length, max })}</span>
      </div>
      <textarea id={id} className="input min-h-16 w-full resize-y text-sm leading-relaxed" value={text} aria-invalid={over || undefined} onChange={(e) => setText(e.target.value)} />
      <div className="mt-1.5 flex justify-end">
        <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? f.copied : t.common.copy}
        </button>
      </div>
    </div>
  );
}
