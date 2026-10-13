"use client";

import { useState } from "react";
import { FileText, RotateCcw, Upload } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { clearCvOverride } from "@/app/actions/applications";
import { CvDropzone } from "./dropzone";
import { useRun } from "./use-run";

/** "Source: …" line with the per-application CV override controls. */
export function SourceBar({ appId, label, isOverride }: { appId: number; label: string; isOverride: boolean }) {
  const { t } = useT();
  const d = t.apps2.docs;
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  return (
    <div className="card mb-4 p-3 no-print">
      <div className="flex flex-wrap items-center gap-2">
        <FileText size={16} aria-hidden="true" className="text-muted" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="text-muted">{d.source}: </span>
          <span className="font-medium">{label}</span>
        </p>
        {isOverride ? (
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} aria-busy={pending} onClick={() => run(() => clearCvOverride(appId), d.overrideRemoved)}>
            <RotateCcw size={14} aria-hidden="true" /> {d.overrideRemove}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-controls="cv-override" onClick={() => setOpen((v) => !v)}>
            <Upload size={14} aria-hidden="true" /> {d.overrideCta}
          </button>
        )}
      </div>
      {open && !isOverride && (
        <div id="cv-override" className="mt-3">
          <CvDropzone endpoint={`/api/applications/${appId}/cv`} title={d.overrideTitle} hint={d.uploadHint} compact />
        </div>
      )}
    </div>
  );
}
