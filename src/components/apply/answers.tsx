"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Minus, Plus, RefreshCw, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { EngineChip } from "@/components/ui";
import { useRun } from "@/components/pipeline/use-run";
import { DEFAULT_MAX, MAX_LIMIT, MIN_LIMIT, QUESTION_LABEL, isQuestionId, isSensitiveQuestion, type DetectedQuestion } from "@/lib/apply/questions";
import type { SavedAnswer } from "@/lib/apply/types";
import type { FormFields } from "@/lib/apply/fields";
import { generateFormAnswers, removeFormAnswer, saveFormAnswer } from "@/app/actions/apply";
import { BankPanel } from "./bank";
import { FieldsSection } from "./fields";

type Draft = Pick<SavedAnswer, "qid" | "question" | "answer" | "max_chars" | "engine">;

export function AnswersStep({ id, questions, saved, fields, hasCv }: { id: number; questions: DetectedQuestion[]; saved: SavedAnswer[]; fields: FormFields | null; hasCv: boolean }) {
  const { t, locale } = useT();
  const a = t.apply2.answers;
  const sf = t.apply2.safety;
  const [selected, setSelected] = useState<Set<string>>(() => new Set([...questions.filter((q) => q.selected).map((q) => q.id), ...saved.filter((s) => isQuestionId(s.qid)).map((s) => s.qid)]));
  const [custom, setCustom] = useState<string[]>(() => saved.filter((s) => !isQuestionId(s.qid)).map((s) => s.question));
  const [customInput, setCustomInput] = useState("");
  const [max, setMax] = useState(saved[0]?.max_chars ?? DEFAULT_MAX);
  const [drafts, setDrafts] = useState<Draft[]>(saved);
  const [gen, runGen] = useRun();

  const toggle = (qid: string) => setSelected((s) => { const n = new Set(s); if (n.has(qid)) n.delete(qid); else n.add(qid); return n; });
  const count = selected.size + custom.length;

  const generate = (limit = max, only?: { qids: string[]; custom: string[] }) =>
    runGen(
      () => generateFormAnswers(id, only?.qids ?? [...selected], only?.custom ?? custom, limit),
      a.saved,
      (r) => setDrafts((d) => { const m = new Map(d.map((x) => [x.qid, x])); for (const x of r.answers) m.set(x.qid, { ...x, max_chars: limit }); return [...m.values()]; }),
    );
  const resize = (delta: number) => {
    const limit = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, max + delta));
    setMax(limit);
    generate(limit);
  };

  return (
    <div className="space-y-5">
      <section className="card p-5 rise" aria-labelledby="qs-h">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="qs-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{a.title}</h2>
            <p className="text-sm text-muted">{a.lead}</p>
          </div>
          <BankPanel />
        </div>
        <fieldset>
          <legend className="sr-only">{a.title}</legend>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {questions.map((q, i) => (
              <li key={q.id} className="rise" style={{ ["--i" as string]: i }}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)] has-[:focus-visible]:[outline-style:solid] ${selected.has(q.id) ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"}`}>
                  <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={selected.has(q.id)} onChange={() => toggle(q.id)} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{QUESTION_LABEL[locale][q.id]}</span>
                    {q.detected && <span className="chip chip-saffron mt-1 !py-0 text-[0.7rem]">{a.detected}</span>}
                    {q.sensitive && <span className="chip mt-1 !py-0 text-[0.7rem]"><ShieldAlert size={10} aria-hidden="true" /> {sf.sensitive}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="custom-q">{a.custom}</label>
            <div className="flex gap-2">
              <input id="custom-q" className="input" value={customInput} placeholder={a.customPlaceholder} maxLength={200}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && customInput.trim().length >= 3) { e.preventDefault(); setCustom((c) => [...c, customInput.trim()].slice(0, 6)); setCustomInput(""); } }} />
              <button type="button" className="btn btn-secondary" disabled={customInput.trim().length < 3 || custom.length >= 6} onClick={() => { setCustom((c) => [...c, customInput.trim()]); setCustomInput(""); }}>
                <Plus size={16} aria-hidden="true" />{a.add}
              </button>
            </div>
            {custom.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {custom.map((c) => (
                  <li key={c} className="chip gap-1">
                    {c}
                    <button type="button" className="rounded-full hover:text-danger" aria-label={`${a.removeOne}: ${c}`} onClick={() => setCustom((xs) => xs.filter((x) => x !== c))}><Trash2 size={12} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className="label" htmlFor="max-chars">{a.maxChars}</label>
            <input id="max-chars" type="number" className="input w-28 tabular" min={MIN_LIMIT} max={MAX_LIMIT} step={50} value={max} onChange={(e) => setMax(Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Number(e.target.value) || DEFAULT_MAX)))} />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => generate()} disabled={gen || count === 0} aria-busy={gen}>
            {gen ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
            {gen ? t.common.generating : drafts.length ? a.regenerate : fmt(a.generateN, { n: count })}
          </button>
        </div>
        <p className="hint">{a.ground}</p>
      </section>

      <div aria-live="polite" className="space-y-3">
        {drafts.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={gen || max <= MIN_LIMIT} onClick={() => resize(-150)}><Minus size={14} aria-hidden="true" />{a.shorter}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={gen || max >= MAX_LIMIT} onClick={() => resize(150)}><Plus size={14} aria-hidden="true" />{a.longer}</button>
          </div>
        )}
        {gen && !drafts.length && <div className="card space-y-2 p-5" aria-hidden="true">{[70, 95, 85].map((w, i) => <div key={i} className="skeleton h-4" style={{ width: `${w}%` }} />)}</div>}
        {!gen && !drafts.length && count === 0 && <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{a.empty}</p>}
        {drafts.map((d, i) => (
          <AnswerCard key={d.qid} id={id} draft={d} i={i}
            onRegen={() => generate(max, isQuestionId(d.qid) ? { qids: [d.qid], custom: [] } : { qids: [], custom: [d.question] })}
            onRemove={() => { setDrafts((xs) => xs.filter((x) => x.qid !== d.qid)); if (isQuestionId(d.qid)) toggle(d.qid); else setCustom((c) => c.filter((x) => x !== d.question)); }}
            busy={gen} />
        ))}
      </div>

      <FieldsSection id={id} initial={fields} hasCv={hasCv} />
    </div>
  );
}

function AnswerCard({ id, draft, i, onRegen, onRemove, busy }: { id: number; draft: Draft; i: number; onRegen: () => void; onRemove: () => void; busy: boolean }) {
  const { t } = useT();
  const a = t.apply2.answers;
  const [text, setText] = useState(draft.answer);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, runSave] = useRun();
  const [, runRemove] = useRun();
  if (!dirty && text !== draft.answer) setText(draft.answer); // regenerated upstream
  const over = text.length > draft.max_chars;
  const tid = `ans-${draft.qid.replace(/[^\w-]/g, "")}`;
  const sensitive = isSensitiveQuestion(draft.qid, draft.question);
  const unfilled = sensitive && /\[[^\]]+\]/.test(text);
  const sf = t.apply2.safety;
  return (
    <article className={`card p-4 rise ${sensitive ? "border-saffron/50" : ""}`} style={{ ["--i" as string]: i }} aria-labelledby={`${tid}-h`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${tid}-h`} className="text-sm font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{draft.question}</h3>
        <span className="flex flex-wrap items-center gap-1.5">
          {draft.engine === "bank" && <span className="chip chip-accent">{sf.reused}</span>}
          {draft.engine === "profile" && <span className="chip chip-success">{sf.fromProfile}</span>}
          {sensitive && <span className={`chip ${unfilled ? "chip-saffron" : ""}`}><ShieldAlert size={12} aria-hidden="true" /> {unfilled ? sf.confirm : sf.sensitive}</span>}
          {!["bank", "profile"].includes(draft.engine) && <EngineChip engine={draft.engine === "edited" ? "heuristic" : draft.engine} t={t} />}
        </span>
      </div>
      {sensitive && <p id={`${tid}-s`} className="mb-2 rounded-lg bg-saffron-soft px-3 py-2 text-xs text-ink-2">{sf.sensitiveHint}</p>}
      <label className="sr-only" htmlFor={tid}>{draft.question}</label>
      <textarea id={tid} className="input min-h-28 w-full resize-y text-sm leading-relaxed" value={text} aria-invalid={over || unfilled || undefined} aria-required={sensitive || undefined}
        aria-describedby={sensitive ? `${tid}-s ${tid}-c` : `${tid}-c`}
        onChange={(e) => { setText(e.target.value); setDirty(true); }} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span id={`${tid}-c`} className={`text-xs tabular ${over ? "text-danger" : "text-muted"}`}>
          {fmt(a.counter, { n: text.length, max: draft.max_chars })}{over ? ` · ${a.tooLong}` : ""}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? t.common.copied : t.common.copy}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onRegen}><RefreshCw size={14} aria-hidden="true" />{a.regenOne}</button>
          <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => runRemove(() => removeFormAnswer(id, draft.qid), a.removed, onRemove)}><Trash2 size={14} aria-hidden="true" />{a.removeOne}</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!dirty || saving} aria-busy={saving} onClick={() => runSave(() => saveFormAnswer(id, draft.qid, text, draft.max_chars), t.common.saved, () => setDirty(false))}>
            {a.saveOne}
          </button>
        </div>
      </div>
    </article>
  );
}
