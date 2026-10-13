"use client";

import { Download, Printer, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { ActionButton } from "@/components/action-button";
import { deleteCoachSession } from "@/app/actions/coach";

export function ReportActions({ sessionId, markdown, filename }: { sessionId: number; markdown: string; filename: string }) {
  const { t } = useT();
  const r = t.coach2.report;
  function download() {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={download}>
        <Download size={16} aria-hidden="true" /> {r.exportMd}
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
        <Printer size={16} aria-hidden="true" /> {r.print}
      </button>
      <ActionButton action={() => deleteCoachSession(sessionId)} confirm={r.removeConfirm} className="btn btn-danger">
        <Trash2 size={16} aria-hidden="true" /> {r.remove}
      </ActionButton>
    </>
  );
}
