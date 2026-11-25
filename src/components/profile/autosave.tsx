"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { createSaveQueue, type SaveStatus } from "./save-queue";

export type { SaveStatus };

/**
 * Debounced autosave. Call schedule(value) on every change; the latest value wins and saves never overlap.
 * flush() saves now and resolves false when the save failed. `save` must be stable (useCallback).
 */
export function useAutosave<T>(save: (v: T) => Promise<{ ok: boolean }>, delay = 700) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [at, setAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [queue] = useState(() =>
    createSaveQueue<T>(save, (s) => {
      if (s === "saved") setAt(Date.now());
      setStatus(s);
    }),
  );

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    return queue.flush();
  }, [queue]);

  const schedule = useCallback(
    (v: T) => {
      queue.set(v);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void queue.flush(), delay);
    },
    [queue, delay],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (queue.dirty()) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      // Leaving the page inside the debounce window still saves the last edit.
      void flush();
    };
  }, [queue, flush]);

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
    <span className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted tabular">
      <span className="sr-only" aria-live="polite">
        {status === "saving" ? s.saving : status === "pending" ? s.unsaved : status === "saved" ? fmt(s.savedAgo, { ago: s.justNow }) : status === "error" ? s.error : ""}
      </span>
      {status === "idle" && s.auto}
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
