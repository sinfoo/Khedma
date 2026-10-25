"use client";

import { useId, useRef, useState } from "react";
import { Download, FileText, RefreshCw, UploadCloud } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { fmtDate } from "@/components/ui";
import { wordCount } from "@/lib/cv/sectionize";
import { CvAdapt } from "./cv-adapt";

export interface UploadMeta {
  fileName: string;
  uploadedAt: string;
  size: number;
}

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";
const MAX = 8 * 1024 * 1024;
type ErrCode = "tooLarge" | "unsupported" | "empty" | "corrupt" | "network" | "bad_request";

const size = (n: number, locale: string) =>
  n >= 1024 * 1024
    ? new Intl.NumberFormat(locale, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(n / 1024 / 1024)
    : new Intl.NumberFormat(locale, { style: "unit", unit: "kilobyte", maximumFractionDigits: 0 }).format(Math.max(1, n / 1024));

/** Drag & drop / file picker for the profile CV. Posts to /api/cv/upload with progress. */
export function CvUpload({ upload, onUploaded, adapt = true }: { upload: UploadMeta | null; onUploaded: (meta: UploadMeta, text: string, markdown?: string, skills?: string[]) => void; /** Run the adapt phase after an upload; the onboarding wizard does its own, without a scan. */ adapt?: boolean }) {
  const { t, locale } = useT();
  const c = t.profile2.cv;
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const hintId = useId();

  // The error stays in the drop zone until the next try, not only in a toast that fades.
  const [err, setErr] = useState<string | null>(null);
  const fail = (code: ErrCode) => {
    setErr(c.errors[code] ?? c.errors.bad_request);
    toast.error(t.common.error, c.errors[code] ?? c.errors.bad_request);
  };
  // A PDF with no text layer (a scan, a flattened Canva export) can be read with OCR in this browser.
  const [scanned, setScanned] = useState<File | null>(null);
  // Bumped on each successful upload: a new CV starts its adapt phase (profile, ranking, scan).
  const [adaptRun, setAdaptRun] = useState(0);
  const [ocrStep, setOcrStep] = useState<string | null>(null);
  const readScan = async (file: File) => {
    setOcrStep(c.ocrLoading);
    try {
      const { ocrPdf } = await import("@/lib/cv/ocr");
      const text = await ocrPdf(file, (done, total) => setOcrStep(done < total ? fmt(c.ocrPage, { n: done + 1, total }) : c.reading));
      setScanned(null);
      send(file, text);
    } catch {
      toast.error(t.common.error, c.ocrFailed);
    } finally {
      setOcrStep(null);
    }
  };

  const send = (file: File, ocr?: string) => {
    if (!/\.(pdf|docx|txt|md|markdown)$/i.test(file.name)) return fail("unsupported");
    if (file.size > MAX) return fail("tooLarge");
    if (!file.size) return fail("empty");
    setScanned(null);
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    if (ocr) fd.append("ocr", ocr);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/cv/upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => {
      setProgress(null);
      fail("network");
    };
    xhr.onload = () => {
      setProgress(null);
      const r = xhr.response as { ok?: boolean; code?: ErrCode; text?: string; fileName?: string; uploadedAt?: string; size?: number; markdown?: string; skills?: string[] } | null;
      if (!r?.ok || !r.text) {
        if (r?.code === "empty" && !ocr && /\.pdf$/i.test(file.name)) return setScanned(file);
        return fail(r?.code ?? "bad_request");
      }
      onUploaded({ fileName: r.fileName ?? file.name, uploadedAt: r.uploadedAt ?? new Date().toISOString(), size: r.size ?? file.size }, r.text, typeof r.markdown === "string" ? r.markdown : undefined, Array.isArray(r.skills) ? r.skills : undefined);
      toast.success(c.uploadedToast, fmt(c.uploadedBody, { n: wordCount(r.text) }));
      setAdaptRun((n) => n + 1);
    };
    setProgress(0);
    xhr.send(fd);
  };

  const busy = progress !== null || ocrStep !== null;
  return (
    <div
      className={`relative rounded-xl border border-dashed p-4 transition-colors ${over ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-2/50"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && !busy) send(f);
      }}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) send(f);
        }}
      />
      {upload ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text" aria-hidden="true">
            <FileText size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted">{c.current}</p>
            <p className="truncate font-semibold" title={upload.fileName}>
              {upload.fileName}
            </p>
            <p className="text-xs text-muted tabular">
              {fmt(c.uploaded, { when: fmtDate(upload.uploadedAt, locale) })} · {size(upload.size, locale)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <a className="btn btn-secondary btn-sm" href="/api/cv/file" download>
              <Download size={14} aria-hidden="true" /> {c.download}
            </a>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()} aria-describedby={hintId}>
              <RefreshCw size={14} aria-hidden="true" /> {c.replace}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-5 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-text" aria-hidden="true">
            <UploadCloud size={22} />
          </span>
          <p className="font-semibold">{c.drop}</p>
          <p className="text-sm text-muted">{c.or}</p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()} aria-describedby={hintId}>
            <UploadCloud size={16} aria-hidden="true" /> {c.browse}
          </button>
        </div>
      )}
      <p id={hintId} className={`hint ${upload ? "" : "text-center"}`}>
        {c.formats}
      </p>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
      {adapt && adaptRun > 0 && <CvAdapt key={adaptRun} />}
      {scanned && !ocrStep && (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm" role="status">
          <p className="font-semibold">{c.scannedTitle}</p>
          <p className="mt-0.5 text-muted">{c.scannedHint}</p>
          <button type="button" className="btn btn-primary btn-sm mt-2" onClick={() => readScan(scanned)}>
            {c.ocrRun}
          </button>
        </div>
      )}
      {ocrStep && (
        <p className="mt-3 text-sm text-muted" role="status">{ocrStep}</p>
      )}
      {progress !== null && (
        <div className="mt-3" aria-live="polite">
          <p className="mb-1 text-xs text-muted tabular">{progress! < 100 ? fmt(c.uploading, { p: progress! }) : c.reading}</p>
          <div role="progressbar" aria-label={c.browse} aria-valuenow={progress!} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
