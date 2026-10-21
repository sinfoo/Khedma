"use client";

import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { DOC_ACCENTS, DOC_DENSITIES, DOC_FONTS, DOC_MARGINS, DOC_TEMPLATES, type DocStyle } from "@/lib/cv/doc-style";
import { saveDocStyle } from "@/app/actions/applications";

/** Design, colour, font, density, size and margins of every sent CV and letter; the preview reloads on change. */
export function DocStylePanel({ initial }: { initial: DocStyle }) {
  const { t } = useT();
  const m = t.apps2.docs.style;
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const set = (patch: Partial<DocStyle>) => {
    setS((x) => ({ ...x, ...patch }));
    start(async () => {
      await saveDocStyle(patch);
    });
  };
  const seg = <K extends "density" | "margins">(key: K, label: string, values: readonly DocStyle[K][], labels: Record<string, string>) => (
    <div role="radiogroup" aria-label={label} className="seg w-full">
      {values.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={s[key] === v} className="seg-btn flex-1" onClick={() => set({ [key]: v } as Partial<DocStyle>)}>
          {labels[v]}
        </button>
      ))}
    </div>
  );

  return (
    <section className="card p-4 no-print" aria-labelledby="style-h" aria-busy={pending}>
      <h2 id="style-h" className="card-title mb-3 text-[0.9rem]">{m.title}</h2>
      <p className="label">{m.template}</p>
      <div role="radiogroup" aria-label={m.template} className="mb-3 grid grid-cols-2 gap-1.5">
        {DOC_TEMPLATES.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={s.template === v} onClick={() => set({ template: v })}
            className={`rounded-lg border px-2.5 py-1.5 text-left text-[0.8rem] ${s.template === v ? "border-accent bg-accent-soft font-semibold" : "border-line hover:bg-surface-2"}`}>
            {m.templates[v]}
          </button>
        ))}
      </div>
      <p className="label">{m.accent}</p>
      <div role="radiogroup" aria-label={m.accent} className="mb-3 flex flex-wrap gap-1.5">
        {DOC_ACCENTS.map((c, i) => (
          <button key={c} type="button" role="radio" aria-checked={s.accent === c} aria-label={m.accents[i]} title={m.accents[i]} onClick={() => set({ accent: c })}
            className={`size-6 rounded-full ring-offset-2 ring-offset-[var(--surface)] ${s.accent === c ? "ring-2 ring-[var(--ink)]" : ""}`} style={{ background: c }} />
        ))}
      </div>
      <label className="label" htmlFor="doc-font">{m.font}</label>
      <select id="doc-font" className="input mb-3" value={s.font} onChange={(e) => set({ font: e.target.value as DocStyle["font"] })}>
        {DOC_FONTS.map((f) => <option key={f} value={f}>{m.fonts[f]}</option>)}
      </select>
      <p className="label">{m.density}</p>
      <div className="mb-3">{seg("density", m.density, DOC_DENSITIES, m.densities)}</div>
      <p className="label">{m.margins}</p>
      <div className="mb-3">{seg("margins", m.margins, DOC_MARGINS, m.marginsList)}</div>
      <div className="mb-3 flex items-center gap-2">
        <span className="label !mb-0 flex-1">{m.size}</span>
        <button type="button" className="btn btn-outline btn-sm !px-2" aria-label={m.smaller} disabled={s.size <= 9} onClick={() => set({ size: s.size - 0.5 })}><Minus size={14} aria-hidden="true" /></button>
        <span className="mono w-12 text-center text-sm tabular" aria-live="polite">{s.size} pt</span>
        <button type="button" className="btn btn-outline btn-sm !px-2" aria-label={m.bigger} disabled={s.size >= 12.5} onClick={() => set({ size: s.size + 0.5 })}><Plus size={14} aria-hidden="true" /></button>
      </div>
      <label className="flex items-start gap-2 text-[0.8rem] text-ink-2">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={s.fit} onChange={(e) => set({ fit: e.target.checked })} />
        {m.fit}
      </label>
    </section>
  );
}
