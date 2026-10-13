"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Eye, Loader2, Pencil, Printer, Save, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Markdown } from "./markdown";
import { EngineChip } from "./ui";

/** Markdown document with edit/preview, save, copy, print and (re)generate. */
export function DocEditor({
  value,
  saveAction,
  generateAction,
  emptyText,
  generateLabel,
  generateHint,
  engine,
  disabledReason,
}: {
  value: string | null;
  saveAction: (md: string) => Promise<void>;
  generateAction: () => Promise<void>;
  emptyText: string;
  generateLabel: string;
  generateHint: string;
  engine?: string | null;
  disabledReason?: string;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [draft, setDraft] = useState(value ?? "");
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gen, startGen] = useTransition();
  const [saving, startSave] = useTransition();
  const current = dirty ? draft : (value ?? "");

  const generate = () =>
    startGen(async () => {
      await generateAction();
      setDirty(false);
      setMode("preview");
    });

  return (
    <div className="card p-5 rise" style={{ ["--i" as string]: 1 }}>
      <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
        <button
          type="button"
          className="btn btn-primary"
          onClick={generate}
          disabled={gen || !!disabledReason}
          aria-busy={gen}
          title={disabledReason}
        >
          {gen ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
          {gen ? t.common.generating : value ? t.common.regenerate : generateLabel}
        </button>
        {value && (
          <>
            <div role="group" aria-label={t.application.preview} className="inline-flex rounded-full border border-line-strong overflow-hidden">
              <button type="button" className={`btn btn-sm rounded-none ${mode === "preview" ? "bg-surface-2" : "btn-ghost"}`} aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>
                <Eye size={14} aria-hidden="true" /> {t.application.preview}
              </button>
              <button type="button" className={`btn btn-sm rounded-none ${mode === "edit" ? "bg-surface-2" : "btn-ghost"}`} aria-pressed={mode === "edit"} onClick={() => { setDraft(current); setMode("edit"); }}>
                <Pencil size={14} aria-hidden="true" /> {t.application.edit}
              </button>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(current); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied ? t.common.copied : t.common.copy}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
              <Printer size={14} aria-hidden="true" /> {t.common.print}
            </button>
            {dirty && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={saving}
                aria-busy={saving}
                onClick={() => startSave(async () => { await saveAction(draft); setDirty(false); })}
              >
                {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />} {t.common.save}
              </button>
            )}
            {engine && <span className="ml-auto"><EngineChip engine={engine} t={t} /></span>}
          </>
        )}
      </div>
      <span role="status" className="sr-only">{copied ? t.common.copied : ""}</span>
      {disabledReason && <p role="status" className="text-sm text-saffron mb-3">{disabledReason}</p>}
      {!value && !gen ? (
        <p className="text-muted">{emptyText} <span className="text-ink-2">{generateHint}</span></p>
      ) : gen && !value ? (
        <p role="status" className="text-muted animate-pulse">{t.common.generating}</p>
      ) : mode === "edit" ? (
        <>
          <label className="sr-only" htmlFor="doc-md">{t.application.edit}</label>
          <textarea
            id="doc-md"
            className="input mono text-sm !min-h-[60vh]"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
            spellCheck={false}
          />
        </>
      ) : (
        <Markdown>{current}</Markdown>
      )}
    </div>
  );
}
