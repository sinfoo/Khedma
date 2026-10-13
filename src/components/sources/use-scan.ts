"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAutoScanState } from "@/app/actions/sources";

export interface SourceStatus {
  state: "queued" | "running" | "done" | "error";
  added?: number;
  listed?: number;
  error?: string;
}

export interface ScanDone {
  type: "done";
  run_id: number;
  added: number;
  errors: number;
  duplicates: number;
  jobs: { id: number; title: string; company: string }[];
}

export type ScanOutcome = { kind: "done"; done: ScanDone } | { kind: "skipped" } | { kind: "busy" } | { kind: "error"; error: string };

/** Client for POST /api/sources/scan: reads the NDJSON progress stream into per-source state. */
export function useScan() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Record<number, SourceStatus>>({});
  const [total, setTotal] = useState(0);
  const busy = useRef(false);

  const start = useCallback(async (opts: { ids?: number[]; trigger?: "manual" | "auto"; keywords?: string[]; countries?: string[] } = {}): Promise<ScanOutcome> => {
    if (busy.current) return { kind: "busy" };
    busy.current = true;
    let done: ScanDone | null = null;
    let error: string | undefined;
    try {
      const res = await fetch("/api/sources/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (res.status === 204) return { kind: "skipped" };
      if (res.status === 409) return { kind: "busy" };
      if (!res.ok || !res.body) return { kind: "error", error: `HTTP ${res.status}` };
      setRunning(true);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line);
          if (e.type === "start") {
            setTotal(e.sources.length);
            setStatus(Object.fromEntries(e.sources.map((s: { id: number }) => [s.id, { state: "queued" }])));
          } else if (e.type === "source") {
            setStatus((st) => ({ ...st, [e.id]: e.status === "running" ? { state: "running" } : { state: e.status, added: e.added, listed: e.listed, error: e.error } }));
          } else if (e.type === "done") done = e;
          else if (e.type === "error") error = e.error;
        }
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy.current = false;
      setRunning(false);
    }
    if (done) return { kind: "done", done };
    return { kind: "error", error: error ?? "Scan interrupted" };
  }, []);

  const finished = Object.values(status).filter((s) => s.state === "done" || s.state === "error").length;
  return { start, running, status, total, finished };
}

/**
 * Auto-scan timer: checks every 5 minutes (and on mount) whether a scan is due per the
 * saved setting, then runs it through `start`. The server re-checks due-ness, so several
 * open tabs never scan twice.
 */
export function useAutoScan(start: (o: { trigger: "auto" }) => Promise<ScanOutcome>, onResult: (r: ScanDone) => void) {
  const cb = useRef(onResult);
  useEffect(() => {
    cb.current = onResult;
  });
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const s = await getAutoScanState();
        if (stop || !s.enabled) return;
        const due = !s.lastRunAt || Date.now() - new Date(s.lastRunAt).getTime() >= s.hours * 3_600_000;
        if (!due) return;
        const r = await start({ trigger: "auto" });
        if (!stop && r.kind === "done") cb.current(r.done);
      } catch {
        // offline dev server or action error: try again next tick
      }
    };
    const first = setTimeout(tick, 4000);
    const timer = setInterval(tick, 5 * 60_000);
    return () => {
      stop = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [start]);
}
