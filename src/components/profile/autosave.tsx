"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/** Debounced autosave. Call schedule(value) on every change; the latest value wins. */
export function useAutosave<T>(save: (v: T) => Promise<{ ok: boolean }>, delay = 700) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [at, setAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{ v: T } | null>(null);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    setStatus("saving");
    try {
      const r = await save(job.v);
      if (!r.ok) throw new Error("save failed");
      setAt(Date.now());
      setStatus(pending.current ? "pending" : "saved");
    } catch {
      pending.current ??= job;
      setStatus("error");
    }
  }, [save]);

  const schedule = useCallback(
    (v: T) => {
      pending.current = { v };
      setStatus("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return { status, at, schedule, flush };
}

/** "Saved · 2 s ago" indicator, announced politely. */
export function SaveIndicator({ status, at, onRetry }: { status: SaveStatus; at: number | null; onRetry: () => void }) {
  const { t, locale } = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const s = t.profile2.status;
  let ago = s.justNow;
  if (at) {
    const sec = Math.max(0, Math.round((now - at) / 1000));
    if (sec >= 5) {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
      ago = sec < 60 ? rtf.format(-sec, "second") : sec < 3600 ? rtf.format(-Math.round(sec / 60), "minute") : rtf.format(-Math.round(sec / 3600), "hour");
    }
  }
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted tabular" aria-live="polite">
      {status === "saving" && (
        <>
          <Loader2 size={14} className="animate-spin" aria-hidden="true" /> {s.saving}
        </>
      )}
      {status === "pending" && (
        <>
          <span className="size-1.5 rounded-full bg-saffron" aria-hidden="true" /> {s.unsaved}
        </>
      )}
      {status === "saved" && (
        <>
          <Check size={14} className="text-success" aria-hidden="true" /> {fmt(s.savedAgo, { ago })}
        </>
      )}
      {status === "error" && (
        <>
          <AlertTriangle size={14} className="text-danger" aria-hidden="true" />
          <span className="text-danger">{s.error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
            {s.retry}
          </button>
        </>
      )}
    </span>
  );
}
