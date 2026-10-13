"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { useToast } from "@/components/kit/toast";
import { useT } from "@/lib/i18n/client";

const ACCEPT = ".pdf,.docx,.md,.txt";

/** Drop or pick a CV file and POST it (multipart field "file") to `endpoint`. */
export function CvDropzone({ endpoint, title, hint, compact = false }: { endpoint: string; title: string; hint?: string; compact?: boolean }) {
  const { t } = useT();
  const d = t.apps2.docs;
  const toast = useToast();
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error(d.uploadFailed, d.tooLarge);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(endpoint, { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string };
      if (!r.ok || j.ok === false) toast.error(d.uploadFailed, d.uploadErrors[j.code as keyof typeof d.uploadErrors] ?? j.error);
      else {
        toast.success(d.uploaded, file.name);
        router.refresh();
      }
    } catch {
      toast.error(d.uploadFailed);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        upload(e.dataTransfer.files?.[0]);
      }}
      className={`rounded-2xl border-2 border-dashed text-center transition-colors ${over ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-2"} ${compact ? "px-4 py-3" : "px-6 py-8"}`}
    >
      {!compact && <FileUp size={22} aria-hidden="true" className="mx-auto mb-2 text-accent-text" />}
      <p id={`${id}-t`} className={compact ? "text-sm" : "font-semibold"}>{title}</p>
      <p className="mt-1 text-sm text-muted">
        {d.drop}{" "}
        <button type="button" className="font-semibold text-accent-text underline underline-offset-2" disabled={busy} aria-describedby={`${id}-t`} onClick={() => input.current?.click()}>
          {d.browse}
        </button>
        <input ref={input} type="file" accept={ACCEPT} hidden tabIndex={-1} aria-hidden="true" onChange={(e) => upload(e.target.files?.[0])} />
      </p>
      {hint && <p className="hint mt-1">{hint}</p>}
      <p role="status" className="mt-2 text-sm text-muted">
        {busy && (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" /> {d.uploading}
          </span>
        )}
      </p>
    </div>
  );
}
