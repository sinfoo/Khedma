"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ScanSearch } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useRun } from "./use-run";
import { checkDocPdf } from "@/app/actions/applications";
import type { PdfIssue } from "@/lib/cv/pdf-check";

/** "Check the PDF": renders the document as sent and reports what an ATS would fail to read. */
export function PdfCheck({ id, kind }: { id: number; kind: "cv" | "letter" }) {
  const { t } = useT();
  const c = t.apps2.flow.pdfCheck;
  const [pending, run] = useRun();
  const [res, setRes] = useState<{ pages: number; issues: PdfIssue[] } | null>(null);
  const text = (i: PdfIssue) =>
    i.kind === "empty-page" ? fmt(c.emptyPage, { n: i.page })
    : i.kind === "garbled" ? fmt(c.garbled, { n: i.count })
    : i.kind === "placeholder" ? fmt(c.placeholder, { t: i.text })
    : i.kind === "missing" ? c.missing[i.what]
    : fmt(c.tooLong, { n: i.pages, max: i.max });
  return (
    <div className="col-span-full">
      <button type="button" className="btn btn-ghost btn-sm !h-7 text-ink-2" disabled={pending} aria-busy={pending} onClick={() => run(() => checkDocPdf(id, kind), undefined, (r) => setRes({ pages: r.pages, issues: r.issues }))}>
        {pending ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <ScanSearch size={13} aria-hidden="true" />} {pending ? c.checking : c.button}
      </button>
      {res && (
        <div role="status" className="mt-1.5 text-[0.78rem]">
          {res.issues.length === 0 ? (
            <p className="flex items-start gap-1.5 text-success"><CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> {fmt(c.ok, { n: res.pages })}</p>
          ) : (
            <ul className="space-y-1">
              {res.issues.map((i, k) => (
                <li key={k} className="flex items-start gap-1.5 text-ink-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-saffron" aria-hidden="true" /> {text(i)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
