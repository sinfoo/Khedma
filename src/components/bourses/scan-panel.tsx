"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Radar } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { Progress } from "@/components/kit";
import { errorReason } from "@/components/sources/error-reason";
import type { FeedResult, ScanEvent } from "@/lib/bourses/store";

type Totals = Extract<ScanEvent, { type: "done" }>;
interface Run {
  running: boolean;
  /** Feed ids being read right now. */
  reading: string[];
  results: Record<string, FeedResult>;
  totals?: Totals;
  error?: string;
}

/**
 * Scan button for the live calls, with per-feed progress while it runs and the honest result after: what each feed
 * gave, and which feeds failed and why. Before a scan it shows the last one (kept on the server).
 */
export function ScanPanel({ feeds, last, lastLabel }: { feeds: { id: string; label: string }[]; last: Record<string, FeedResult>; lastLabel: string | null }) {
  const { t } = useT();
  const m = t.bourses2.scan;
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const results = run?.results ?? last;
  const done = feeds.filter((f) => results[f.id]).length;
  const failed = feeds.filter((f) => results[f.id]?.state === "error");

  async function scan() {
    let state: Run = { running: true, reading: [], results: {} };
    const update = (patch: Partial<Run>) => setRun((state = { ...state, ...patch }));
    update({});
    try {
      const res = await fetch("/api/bourses/scan", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (res.status === 409) return update({ running: false, error: m.busy });
      if (!res.ok || !res.body) return update({ running: false, error: fmt(m.error, { error: `HTTP ${res.status}` }) });
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done: end } = await reader.read();
        buf += value ?? "";
        const lines = buf.split("\n");
        buf = end ? "" : (lines.pop() ?? "");
        for (const line of lines.filter(Boolean)) {
          const e = JSON.parse(line) as ScanEvent | { type: "error"; error: string };
          if (e.type === "feed" && e.state === "running") update({ reading: [...state.reading, e.id] });
          else if (e.type === "feed") update({ reading: state.reading.filter((id) => id !== e.id), results: { ...state.results, [e.id]: e } });
          else if (e.type === "done") update({ totals: e });
          else if (e.type === "error") update({ error: fmt(m.error, { error: e.error }) });
        }
        if (end) break;
      }
    } catch (e) {
      update({ error: fmt(m.error, { error: (e as Error).message }) });
    } finally {
      update({ running: false, reading: [] });
      router.refresh();
    }
  }

  const line = (f: { id: string; label: string }) => {
    const r = results[f.id];
    if (run?.reading.includes(f.id)) return m.reading;
    if (!r) return run?.running ? m.waiting : m.notRead;
    if (r.state === "error") return errorReason(t, r.error);
    return `${fmt(m.kept, { kept: r.kept, items: r.items })}${r.state === "cached" ? ` (${m.cached})` : ""}`;
  };

  return (
    <section aria-label={m.button} className="card mb-4 grid gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{lastLabel ? fmt(m.last, { date: lastLabel }) : m.never}</p>
        <button type="button" className={lastLabel ? "btn btn-outline btn-sm" : "btn btn-primary btn-sm"} disabled={run?.running} aria-busy={run?.running} onClick={scan}>
          {run?.running ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Radar size={14} aria-hidden="true" />}
          {run?.running ? m.scanning : lastLabel ? m.again : m.button}
        </button>
      </div>

      {run?.running && <Progress value={done} max={Math.max(1, feeds.length)} label={fmt(m.progress, { done, n: feeds.length })} />}
      <p role="status" className="text-sm empty:hidden">
        {run?.running ? fmt(m.progress, { done, n: feeds.length }) : run?.totals ? fmt(m.summary, { ...run.totals }) : ""}
      </p>
      {run?.error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {run.error}
        </p>
      )}
      {!run?.running && failed.length > 0 && (
        <div className="rounded-xl border border-line p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-saffron">
            <AlertTriangle size={15} aria-hidden="true" /> {fmt(m.failed, { n: failed.length })}
          </p>
          <ul className="mt-1.5 grid gap-1 text-ink-2">
            {failed.map((f) => (
              <li key={f.id}>
                <span className="font-medium text-ink">{f.label}</span>: {errorReason(t, results[f.id].error)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="text-sm" open={run?.running || undefined}>
        <summary className="cursor-pointer text-muted">{fmt(m.details, { n: feeds.length })}</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {feeds.map((f) => (
            <li key={f.id} className="flex min-w-0 gap-1.5">
              <span className="truncate font-medium">{f.label}</span>
              <span className={`shrink-0 ${results[f.id]?.state === "error" ? "text-danger" : "text-muted"}`}>{line(f)}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
