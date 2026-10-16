"use client";

import { useState } from "react";
import { Library, Loader2, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { Dialog } from "@/components/kit/dialog";
import { fmtDate } from "@/components/ui";
import { useRun } from "@/components/pipeline/use-run";
import type { BankAnswer } from "@/lib/apply/bank";
import { deleteBankEntry, listBankAnswers, updateBankEntry } from "@/app/actions/apply";

/** "Banque de réponses": list / edit / delete every answer saved across applications. */
export function BankPanel() {
  const { t } = useT();
  const b = t.apply2.bank;
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BankAnswer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const show = async () => {
    setOpen(true);
    setLoading(true);
    try {
      setRows(await listBankAnswers());
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={show}><Library size={14} aria-hidden="true" />{b.open}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={b.title} description={b.lead} variant="drawer">
        <div className="space-y-3 p-5" aria-live="polite">
          {loading && !rows && <div className="space-y-2" aria-hidden="true">{[80, 95, 60].map((w, i) => <div key={i} className="skeleton h-4" style={{ width: `${w}%` }} />)}</div>}
          {rows && rows.length === 0 && <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{b.empty}</p>}
          {rows?.map((r, i) => (
            <BankRow key={r.id} row={r} i={i} onDelete={() => setRows((xs) => (xs ?? []).filter((x) => x.id !== r.id))} />
          ))}
        </div>
      </Dialog>
    </>
  );
}

function BankRow({ row, i, onDelete }: { row: BankAnswer; i: number; onDelete: () => void }) {
  const { t, locale } = useT();
  const b = t.apply2.bank;
  const [text, setText] = useState(row.answer);
  const [saving, runSave] = useRun();
  const [removing, runRemove] = useRun();
  const tid = `bank-${row.id}`;
  return (
    <article className="card p-4 rise" style={{ ["--i" as string]: i }} aria-labelledby={`${tid}-h`}>
      <h3 id={`${tid}-h`} className="text-sm font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{row.question}</h3>
      <p className="mb-2 text-xs text-muted">{fmt(b.uses, { n: row.uses })} · {fmt(b.updated, { d: fmtDate(row.updated_at, locale) })}</p>
      <label className="sr-only" htmlFor={tid}>{b.answer}</label>
      <textarea id={tid} className="input min-h-24 w-full resize-y text-sm leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
        <button type="button" className="btn btn-ghost btn-sm text-danger" disabled={removing} aria-busy={removing} onClick={() => runRemove(() => deleteBankEntry(row.id), b.removed, onDelete)}>
          {removing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}{b.remove}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving || text === row.answer || !text.trim()} aria-busy={saving} onClick={() => runSave(() => updateBankEntry(row.id, text), b.saved)}>
          {b.save}
        </button>
      </div>
    </article>
  );
}
