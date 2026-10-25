"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAutoScanState } from "@/app/actions/sources";
import type { FoundJob, WidenCounts } from "@/lib/repo/sources";
import type { PlanRun, PlanSkipped, Remote } from "@/lib/search/plan";
import type { JobType } from "@/lib/types";

export type { FoundJob, WidenCounts };

export interface SourceStatus {
  state: "queued" | "running" | "done" | "error";
  added?: number;
  listed?: number;
  kept?: number;
  /** Matched offers the database already had. */
  known?: number;
  dropped?: Record<string, number>;
  error?: string;
  /** Done, but part of the source failed (one keyword rate-limited, a page timed out). */
  warning?: string;
}

export interface ScanPlan {
  runs: PlanRun[];
  skipped: PlanSkipped[];
  skippedBlacklist: number;
}

export interface ScanDone {
  type: "done";
  run_id: number;
  added: number;
  errors: number;
  duplicates: number;
  dropped?: Record<string, number>;
  closed?: number;
  jobs: { id: number; title: string; company: string }[];
  /** Offers the widen buttons would bring back (absent when the scan was stopped). */
  widen?: WidenCounts;
  /** Stopped by the user: what was found so far. */
  stopped?: boolean;
  /** A retry of some runs: it adds to the scan already shown. */
  retry?: boolean;
  /** Keywords, countries and options of this scan, as shown in its summary. */
  searched?: string;
}

export interface ScanRequest {
  ids?: number[];
  /** Only these planned runs (Retry on failed sources). */
  keys?: string[];
  trigger?: "manual" | "auto";
  keywords?: string[];
  countries?: string[];
  remote?: Remote;
  types?: JobType[];
  negatives?: string[];
  includeSenior?: boolean;
}

/** `error` is a raw code ("HTTP 500", "interrupted"…): show it through errorReason(). */
export type ScanOutcome = { kind: "done"; done: ScanDone } | { kind: "skipped" } | { kind: "busy" } | { kind: "cancelled" } | { kind: "error"; error: string };

/** What the Sources page keeps in sessionStorage so Back restores the whole result, not just the rows. */
export interface ScanSnapshot {
  jobs: FoundJob[];
  plan: ScanPlan | null;
  status: Record<string | number, SourceStatus>;
}

/** Client for POST /api/sources/scan: reads the NDJSON stream into the plan, per-run status and the live job list. */
export function useScan() {
  const [running, setRunning] = useState(false);
  // Keyed by run key, and by saved-source id when the run has one (the Sources page reads by id).
  const [status, setStatus] = useState<Record<string | number, SourceStatus>>({});
  const [plan, setPlan] = useState<ScanPlan | null>(null);
  const [jobs, setJobs] = useState<FoundJob[]>([]);
  const [total, setTotal] = useState(0);
  const busy = useRef(false);
  const ctrl = useRef<AbortController | null>(null);

  /**
   * Reads one NDJSON scan stream (a new scan, or the running one replayed from its start).
   * `merge`: a retry of some runs; the plan, the other runs' status and the kept offers stay.
   */
  const follow = useCallback(async (req: () => Promise<Response>, merge = false): Promise<ScanOutcome | null> => {
    if (busy.current) return { kind: "busy" };
    busy.current = true;
    ctrl.current = new AbortController();
    let done: ScanDone | null = null;
    let error: string | undefined;
    try {
      const res = await req();
      if (res.status === 204) return null;
      if (res.status === 409) return { kind: "busy" };
      if (!res.ok || !res.body) return { kind: "error", error: `HTTP ${res.status}` };
      setRunning(true);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const keysOf = (e: { key?: string; id?: number }) => [e.key, e.id].filter((k): k is string | number => k !== undefined && k !== 0);
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
          if (e.type === "plan") {
            const runs = e.runs as PlanRun[];
            const init: Record<string | number, SourceStatus> = {};
            for (const r of runs) for (const k of keysOf({ key: r.key, id: r.sourceId })) init[k] = { state: "queued" };
            if (e.retry) merge = true;
            if (merge) setStatus((st) => ({ ...st, ...init }));
            else {
              setJobs([]);
              setPlan({ runs, skipped: e.skipped ?? [], skippedBlacklist: e.skipped_blacklist ?? 0 });
              setTotal(runs.length);
              setStatus(init);
            }
          } else if (e.type === "source") {
            const next: SourceStatus = e.status === "running" ? { state: "running" } : { state: e.status, added: e.added, listed: e.listed, kept: e.kept, known: e.known, dropped: e.dropped, error: e.error, warning: e.warning };
            setStatus((st) => {
              const out = { ...st };
              for (const k of keysOf(e)) out[k] = next;
              return out;
            });
          } else if (e.type === "job") setJobs((js) => (js.some((j) => j.id === e.job.id) ? js : [...js, e.job as FoundJob]));
          else if (e.type === "liveness") {
            const closed = new Set<number>(e.closed ?? []);
            if (closed.size) setJobs((js) => js.filter((j) => !closed.has(j.id)));
          } else if (e.type === "done") done = e;
          else if (e.type === "error") error = e.error;
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return { kind: "cancelled" };
      error = (e as Error).message;
    } finally {
      busy.current = false;
      ctrl.current = null;
      setRunning(false);
    }
    if (done) return { kind: "done", done: merge ? { ...done, retry: true } : done };
    return { kind: "error", error: error ?? "interrupted" };
  }, []);

  const start = useCallback(
    async (opts: ScanRequest = {}): Promise<ScanOutcome> =>
      (await follow(() => fetch("/api/sources/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(opts), signal: ctrl.current?.signal }), !!opts.keys?.length)) ?? { kind: "skipped" },
    [follow],
  );
  /** Reattach to a scan still running on the server (the page was left or reloaded); null when none is. */
  const attach = useCallback(() => follow(() => fetch("/api/sources/scan", { signal: ctrl.current?.signal })), [follow]);

  const finished = plan ? plan.runs.filter((r) => ["done", "error"].includes(status[r.key]?.state ?? "")).length : 0;
  const dropped: Record<string, number> = {};
  for (const r of plan?.runs ?? []) for (const [k, n] of Object.entries(status[r.key]?.dropped ?? {})) dropped[k] = (dropped[k] ?? 0) + n;
  // Leaving the page keeps the scan running on the server; Stop is the one thing that ends it.
  const stop = useCallback(() => {
    void fetch("/api/sources/scan", { method: "DELETE" }).catch(() => {});
    ctrl.current?.abort();
  }, []);
  const restore = useCallback((s: ScanSnapshot) => {
    setJobs(s.jobs);
    setPlan(s.plan);
    setStatus(s.status ?? {});
    setTotal(s.plan?.runs.length ?? 0);
  }, []);
  /** Offers brought back by a widen button, appended to the feed. */
  const addJobs = useCallback((more: FoundJob[]) => setJobs((js) => [...js, ...more.filter((m) => !js.some((j) => j.id === m.id))]), []);
  return { start, attach, stop, restore, addJobs, running, status, total, finished, plan, jobs, dropped };
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
