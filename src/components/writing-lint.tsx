"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { lintWriting, type LintFinding } from "@/lib/ai/writing";
import { fixSentence } from "@/lib/ai/writing-fix";
import { checkFacts, type FactFinding } from "@/lib/cv/facts";

const SHOW = 8;

/**
 * Anti-slop chips under a generated text. "Fix" rewrites just that sentence (AI, else
 * the deterministic fix) and hands the new sentence back; "Edit" lets the parent focus it.
 */
export function WritingLint({ text, onReplace, onEdit, className = "" }: { text: string; onReplace: (sentence: string, next: string) => void; onEdit?: (f: LintFinding) => void; className?: string }) {
  const { t, locale } = useT();
  const l = t.apps2.docs.lint;
  const toast = useToast();
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [, start] = useTransition();
  const findings = useMemo(() => lintWriting(text, locale), [text, locale]);
  if (!text.trim()) return null;
  if (!findings.length)
    return (
      <p className={`flex items-center gap-1.5 text-xs text-success ${className}`} role="status">
        <CheckCircle2 size={14} aria-hidden="true" /> {l.clean}
      </p>
    );
  const shown = all ? findings : findings.slice(0, SHOW);
  const fix = (f: LintFinding, i: number) => {
    setBusy(i);
    start(async () => {
      try {
        const r = await fixSentence(f.sentence, f.excerpt, f.rule, locale);
        if (r.ok) {
          onReplace(f.sentence, r.text);
          toast.success(fmt(l.fixed, { engine: r.engine }));
        } else toast.info(l.noFix);
      } catch {
        toast.error(t.common.error);
      } finally {
        setBusy(null);
      }
    });
  };
  return (
    <section className={`rounded-xl border border-line bg-surface-2 p-3 ${className}`} aria-labelledby="lint-h">
      <h3 id="lint-h" className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-2" style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.04em" }}>
        <AlertTriangle size={14} aria-hidden="true" className="text-saffron" /> {l.title} · <span className="tabular">{fmt(l.summary, { n: findings.length })}</span>
      </h3>
      <ul className="space-y-1.5">
        {shown.map((f, i) => (
          <li key={`${f.rule}-${f.index}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className={`chip ${f.severity === "error" ? "chip-danger" : "chip-saffron"}`}>{l.rules[f.rule]}</span>
            <span className="mono min-w-0 truncate text-xs text-ink" title={f.sentence}>“{f.excerpt}”</span>
            <span className="text-xs text-muted">{f.suggestion}</span>
            <span className="ml-auto flex gap-1">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} aria-busy={busy === i} aria-label={`${l.fix}: ${f.excerpt}`} onClick={() => fix(f, i)}>
                {busy === i ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />} {busy === i ? l.fixing : l.fix}
              </button>
              {onEdit && (
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`${l.edit}: ${f.excerpt}`} onClick={() => onEdit(f)}>
                  <Pencil size={13} aria-hidden="true" /> {l.edit}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {findings.length > SHOW && !all && (
        <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => setAll(true)}>
          {fmt(l.more, { n: findings.length - SHOW })}
        </button>
      )}
    </section>
  );
}

export const useFacts = (source: string | null | undefined, generated: string) => useMemo(() => (source?.trim() ? checkFacts(source, generated) : []), [source, generated]);

/** Invented-fact list; with `onConfirm` it also renders the acknowledgement checkbox that gates "Accept". */
export function FactGate({ findings, confirmed, onConfirm, className = "" }: { findings: FactFinding[]; confirmed?: boolean; onConfirm?: (v: boolean) => void; className?: string }) {
  const { t } = useT();
  const f = t.apps2.docs.facts;
  if (!findings.length)
    return (
      <p className={`flex items-center gap-1.5 text-xs text-success ${className}`} role="status">
        <CheckCircle2 size={14} aria-hidden="true" /> {f.none}
      </p>
    );
  return (
    <section className={`rounded-xl border border-danger/30 bg-danger-soft p-3 ${className}`} aria-labelledby="facts-h" aria-live="polite">
      <h3 id="facts-h" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-danger" style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.04em" }}>
        <AlertTriangle size={14} aria-hidden="true" /> {f.title} · <span className="tabular">{fmt(f.count, { n: findings.length })}</span>
      </h3>
      <p className="mt-1 text-xs text-ink-2">{f.lead}</p>
      <ul className="mt-2 space-y-1.5">
        {findings.map((x) => (
          <li key={`${x.kind}-${x.value}`} className="text-sm">
            <span className="font-medium text-danger">⚠ {fmt(f.invented, { v: x.value })}</span>
            <span className="chip ml-2 align-middle text-[0.7rem]">{f.kinds[x.kind]}</span>
            <span className="mono mt-0.5 block truncate text-xs text-ink-2" title={x.sentence}>{x.sentence}</span>
          </li>
        ))}
      </ul>
      {onConfirm && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!!confirmed} onChange={(e) => onConfirm(e.target.checked)} />
          {f.confirm}
        </label>
      )}
    </section>
  );
}
