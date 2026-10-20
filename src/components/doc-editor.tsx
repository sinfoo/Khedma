"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Columns2, Copy, Download, Eye, FileText, Loader2, Pencil, RotateCcw, Save, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { Menu, MenuItem } from "@/components/kit/menu";
import type { Result } from "@/lib/repo/apps";
import type { LintFinding } from "@/lib/ai/writing";
import { Markdown } from "./markdown";
import { EngineChip } from "./ui";
import { diffLines } from "./pipeline/diff";
import { FactGate, WritingLint, useFacts } from "./writing-lint";

const words = (s: string) => (s.replace(/[#>*_`|[\]()-]+/g, " ").match(/[\p{L}\p{N}][\p{L}\p{N}'’+#.]*/gu) ?? []).length;

/** A document that gets sent: the PDF is the main view and download; its Markdown text is the editable source. */
export function DocEditor({
  value,
  saveAction,
  generateAction,
  emptyText,
  generateLabel,
  generateHint,
  engine,
  disabledReason,
  disabledSlot,
  downloads,
  original,
  compare = true,
  preview,
  limit,
}: {
  value: string | null;
  saveAction: (md: string) => Promise<Result | void>;
  generateAction: () => Promise<Result<{ engine: string; dropped?: string[] }> | void>;
  emptyText: string;
  generateLabel: string;
  generateHint: string;
  engine?: string | null;
  disabledReason?: string;
  /** Rendered under the disabled reason (e.g. an upload dropzone). */
  disabledSlot?: React.ReactNode;
  downloads?: { pdf?: string; docx?: string; md?: string };
  /** The rendered sheet (print page), shown as the preview. */
  preview?: string;
  /** Source document: checks the facts, and enables the side-by-side compare view unless `compare` is false. */
  original?: string | null;
  compare?: boolean;
  /** Rough fit: past `words`, the document likely runs over `pages`. */
  limit?: { words: number; pages: number };
}) {
  const { t } = useT();
  const d = t.apps2.docs;
  const toast = useToast();
  const [mode, setMode] = useState<"preview" | "edit" | "compare">("preview");
  const [draft, setDraft] = useState(value ?? "");
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gen, startGen] = useTransition();
  const [saving, startSave] = useTransition();
  const current = dirty ? draft : (value ?? "");
  const count = useMemo(() => words(current), [current]);
  const area = useRef<HTMLTextAreaElement>(null);
  const [select, setSelect] = useState<string | null>(null);
  const facts = useFacts(original, current);

  // Replace one sentence (from a lint fix) in the working copy; the user saves explicitly.
  const replaceSentence = (sentence: string, next: string) => {
    if (!current.includes(sentence)) return;
    setDraft(current.replace(sentence, next));
    setDirty(true);
  };
  const editAt = (f: LintFinding) => {
    if (!dirty) setDraft(current);
    setMode("edit");
    setSelect(f.excerpt);
  };
  useEffect(() => {
    if (mode !== "edit" || !select || !area.current) return;
    const el = area.current;
    const at = el.value.indexOf(select);
    el.focus();
    if (at >= 0) el.setSelectionRange(at, at + select.length);
    setSelect(null);
  }, [mode, select]);

  const generate = () => {
    if ((dirty || value?.trim()) && !window.confirm(dirty ? d.discardConfirm : d.replaceConfirm)) return;
    startGen(async () => {
      try {
        const r = await generateAction();
        if (r && !r.ok) {
          toast.error(t.common.error, r.error);
          return;
        }
        toast.success(d.generated);
        if (r?.ok && r.dropped?.length) toast.info(d.dropped, r.dropped.slice(0, 3).join(" · "));
        setDirty(false);
        setMode("preview");
      } catch {
        toast.error(t.common.error);
      }
    });
  };

  const save = () =>
    startSave(async () => {
      try {
        const r = await saveAction(draft);
        if (r && !r.ok) toast.error(t.common.error, r.error);
        else {
          setDirty(false);
          toast.success(d.savedDoc);
        }
      } catch {
        toast.error(t.common.error);
      }
    });

  const tabBtn = (m: typeof mode, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      className={`btn btn-sm rounded-none ${mode === m ? "bg-surface-3 text-ink" : "btn-ghost"}`}
      aria-pressed={mode === m}
      onClick={() => {
        if (m === "edit" && !dirty) setDraft(current);
        setMode(m);
      }}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2 no-print">
        {value && downloads?.pdf && !dirty && (
          <a href={downloads.pdf} className="btn btn-primary" download>
            <Download size={16} aria-hidden="true" /> {d.pdf}
          </a>
        )}
        <button type="button" className={`btn ${value ? "btn-outline" : "btn-primary"}`} onClick={generate} disabled={gen || !!disabledReason} aria-busy={gen} aria-describedby={disabledReason ? "doc-disabled" : undefined}>
          {gen ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
          {gen ? t.common.generating : value ? t.common.regenerate : generateLabel}
        </button>
        {value && (
          <>
            <div role="group" aria-label={d.viewMode} className="inline-flex overflow-hidden rounded-full border border-line-strong">
              {tabBtn("preview", <Eye size={14} aria-hidden="true" />, t.application.preview)}
              {tabBtn("edit", <Pencil size={14} aria-hidden="true" />, d.editText)}
              {compare && original?.trim() && tabBtn("compare", <Columns2 size={14} aria-hidden="true" />, d.compare)}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(current).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  },
                  () => toast.error(t.common.error),
                );
              }}
            >
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied ? t.common.copied : t.common.copy}
            </button>
            {(downloads?.docx || downloads?.md) && (
              <Menu label={d.otherFormats} triggerClassName="btn btn-ghost btn-sm" align="start" trigger={<><FileText size={14} aria-hidden="true" /> {d.otherFormats}</>}>
                {downloads?.docx && <MenuItem href={downloads.docx}><FileText size={14} aria-hidden="true" /> {d.docx}</MenuItem>}
                {downloads?.md && <MenuItem href={downloads.md}><Download size={14} aria-hidden="true" /> {d.md}</MenuItem>}
              </Menu>
            )}
            {dirty && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" disabled={saving} aria-busy={saving} onClick={save}>
                  {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />} {t.common.save}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDirty(false); setDraft(value ?? ""); }}>
                  <RotateCcw size={14} aria-hidden="true" /> {d.discard}
                </button>
              </>
            )}
            <span className="ml-auto flex items-center gap-2">
              {limit && count > limit.words ? (
                <span className="chip chip-danger tabular" title={fmt(d.tooLong, { max: limit.words, p: limit.pages })}>
                  {fmt(d.words, { n: count })} · {fmt(d.tooLongShort, { p: limit.pages })}
                </span>
              ) : (
                <span className="mono text-xs text-muted tabular">{fmt(d.words, { n: count })}</span>
              )}
              {dirty && <span className="chip chip-saffron">{d.unsaved}</span>}
              {engine && <EngineChip engine={engine} t={t} />}
            </span>
          </>
        )}
      </div>
      <span role="status" className="sr-only">{copied ? t.common.copied : gen ? t.common.generating : ""}</span>
      {disabledReason && (
        <div className="mb-4 no-print">
          <p id="doc-disabled" className="mb-3 text-sm font-medium text-saffron">{disabledReason}</p>
          {disabledSlot}
        </div>
      )}
      {!value && !gen ? (
        <p className="text-muted">
          {emptyText} <span className="text-ink-2">{generateHint}</span>
        </p>
      ) : gen && !value ? (
        <div className="space-y-2" aria-hidden="true">
          {[90, 70, 80, 60, 75].map((w, i) => (
            <div key={i} className="skeleton h-4" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : mode === "edit" ? (
        <>
          <label className="sr-only" htmlFor="doc-md">{d.editLabel}</label>
          <textarea
            id="doc-md"
            ref={area}
            className="input mono text-sm !min-h-[60vh]"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                if (dirty) save();
              }
            }}
            spellCheck={false}
          />
        </>
      ) : mode === "compare" && original ? (
        <>
          <FactGate findings={facts} className="mb-3 no-print" />
          <Compare original={original} tailored={current} />
        </>
      ) : preview && !dirty ? (
        // The sheet as it will be sent (same page the PDF is printed from); reloads when the saved text changes.
        <iframe key={value ?? ""} src={preview} title={t.application.preview} className={`h-[78vh] w-full rounded-xl border border-line bg-surface ${gen ? "opacity-60 transition-opacity" : ""}`} />
      ) : (
        <article className={gen ? "opacity-60 transition-opacity" : ""}>
          <Markdown>{current}</Markdown>
        </article>
      )}
      {value && !gen && (
        <div className="mt-4 space-y-3 no-print">
          {mode !== "compare" && facts.length > 0 && <FactGate findings={facts} />}
          <WritingLint text={current} onReplace={replaceSentence} onEdit={editAt} />
        </div>
      )}
    </div>
  );
}

function Compare({ original, tailored }: { original: string; tailored: string }) {
  const { t } = useT();
  const d = t.apps2.docs;
  const ops = useMemo(() => diffLines(original, tailored), [original, tailored]);
  const added = ops.filter((o) => o.type === "add").length;
  const removed = ops.filter((o) => o.type === "del").length;
  const pane = (side: "del" | "add", title: string) => (
    <section aria-label={title} className="min-w-0 rounded-xl border border-line">
      <h3 className="border-b border-line px-3 py-2 text-sm font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{title}</h3>
      <pre className="mono max-h-[65vh] overflow-auto whitespace-pre-wrap break-words p-2 text-[0.8rem] leading-relaxed">
        {ops
          .filter((o) => o.type === "same" || o.type === side)
          .map((o, i) =>
            o.type === "same" ? (
              <span key={i} className="block px-1 text-ink-2">{o.text || " "}</span>
            ) : (
              <span key={i} className={`block rounded px-1 ${side === "add" ? "bg-success-soft" : "bg-danger-soft line-through decoration-1"}`}>
                <span className="sr-only">{side === "add" ? d.added : d.removed}: </span>
                {o.text || " "}
              </span>
            ),
          )}
      </pre>
    </section>
  );
  return (
    <div>
      <p className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className="chip chip-success">+{added} {d.added}</span>
        <span className="chip chip-danger">−{removed} {d.removed}</span>
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {pane("del", d.original)}
        {pane("add", d.tailored)}
      </div>
    </div>
  );
}
