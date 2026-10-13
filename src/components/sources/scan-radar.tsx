"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { placeCodes, platformLinks } from "@/lib/sources/catalog";
import type { PlanSkipped } from "@/lib/search/plan";
import type { SourceStatus } from "./use-scan";

interface RadarSource {
  /** Saved source id (Sources page) and/or plan run key (search). */
  id?: number;
  key?: string;
  label: string;
  kind: string;
}

/**
 * Live "searching" radar shown during a scan: a sweeping beam, one blip per planned run that
 * lights up as it is searched, a live counter, the keywords being used, and why offers were dropped.
 * Only planned runs are shown; sources skipped by the country plan get one summary line.
 */
export function ScanRadar({
  sources,
  status,
  keywords,
  location,
  finished,
  total,
  running,
  skipped = [],
  skippedBlacklist = 0,
  dropped = {},
}: {
  sources: RadarSource[];
  status: Record<string | number, SourceStatus>;
  keywords: string[];
  location: string;
  finished: number;
  total: number;
  running: boolean;
  skipped?: PlanSkipped[];
  skippedBlacklist?: number;
  dropped?: Record<string, number>;
}) {
  const { t, locale } = useT();
  const r = t.sources2.radar;
  const fr = locale === "fr";
  const st = (s: RadarSource) => status[s.key ?? s.id ?? ""];
  const added = sources.reduce((n, s) => n + (st(s)?.added ?? 0), 0);
  const current = sources.find((s) => st(s)?.state === "running");
  const kw = keywords.slice(0, 4).join(", ");
  // `location` is either ISO codes ("DE,FR") or free-text places; link-only boards of those countries get a search link.
  const links = platformLinks(keywords.length ? keywords : [fr ? "stage ingénieur" : "engineering internship"], placeCodes(location));
  const droppedTotal = Object.values(dropped).reduce((a, b) => a + b, 0);
  const droppedText = Object.entries(dropped)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${r.reasons[k as keyof typeof r.reasons] ?? k} ${n}`)
    .join(", ");

  // Rotating status line: the running source, else a reassuring phrase.
  const phrases = useMemo(() => [r.phrase1, r.phrase2, r.phrase3], [r.phrase1, r.phrase2, r.phrase3]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((x) => x + 1), 1800);
    return () => clearInterval(id);
  }, [running]);
  const line = current ? fmt(r.searching, { src: current.label, kw }) : running ? phrases[tick % phrases.length] : fmt(r.doneLine, { n: added });

  const R = 92;
  return (
    <section className="card relative overflow-hidden p-5 fade" role="status" aria-live="polite" aria-busy={running}>
      <div className="pattern pattern-fade" aria-hidden="true" />
      <div className="relative grid items-center gap-6 md:grid-cols-[auto_1fr]">
        {/* Radar */}
        <div className="relative mx-auto grid size-[232px] place-items-center" aria-hidden="true">
          <div className="absolute inset-0 rounded-full border border-line" />
          <div className="absolute inset-[23%] rounded-full border border-line/70" />
          <div className="absolute inset-[46%] rounded-full border border-line/50" />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from 0deg, color-mix(in oklab, var(--accent) 45%, transparent), transparent 70deg)",
              animation: running ? "radar-sweep 2.4s linear infinite" : "none",
              opacity: running ? 1 : 0.25,
              maskImage: "radial-gradient(circle, black 0 95%, transparent 96%)",
            }}
          />
          {sources.map((s, i) => {
            const a = (i / Math.max(1, sources.length)) * Math.PI * 2 - Math.PI / 2;
            const state = st(s)?.state ?? "queued";
            const col = state === "done" ? "var(--success)" : state === "error" ? "var(--danger)" : state === "running" ? "var(--accent)" : "var(--line-strong)";
            return (
              <span
                key={s.key ?? s.id}
                className={`absolute size-3 rounded-full ${state === "running" ? "pulse-soft" : ""}`}
                style={{ left: `calc(50% + ${Math.cos(a) * R}px - 6px)`, top: `calc(50% + ${Math.sin(a) * R}px - 6px)`, background: col, transition: "background .3s" }}
                title={s.label}
              />
            );
          })}
          <div className="relative text-center">
            <p className="display text-4xl leading-none tabular">{added}</p>
            <p className="mt-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">{r.newOffers}</p>
          </div>
        </div>

        {/* Status + sources + platform links */}
        <div className="min-w-0 space-y-4">
          <div>
            <p className="flex items-center gap-2 text-base font-semibold">
              {running ? <Loader2 size={16} className="animate-spin text-accent-text" aria-hidden="true" /> : <CheckCircle2 size={16} className="text-success" aria-hidden="true" />}
              <span key={line} className="fade">{line}</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {fmt(r.progress, { done: finished, total })}
              {kw ? ` · ${fmt(r.using, { kw })}` : ""}
              {droppedTotal > 0 && (
                <>
                  {" · "}
                  <span>{fmt(r.dropped, { n: droppedTotal })} ({droppedText})</span>
                </>
              )}
            </p>
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label={r.sourcesLabel}>
            {sources.map((s) => {
              const x = st(s);
              const state = x?.state ?? "queued";
              const cls = state === "done" ? "chip-success" : state === "error" ? "chip-danger" : state === "running" ? "chip-accent" : "";
              return (
                <li key={s.key ?? s.id} className={`chip ${cls}`} title={state === "error" ? x?.error : undefined}>
                  {state === "running" && <Loader2 size={11} className="animate-spin" aria-hidden="true" />}
                  {state === "error" && <AlertTriangle size={11} aria-hidden="true" />}
                  {s.label}
                  {state === "done" && <span className="tabular">· {x?.added ?? 0}</span>}
                  <span className="sr-only">
                    {state === "done" ? fmt(r.srDone, { n: x?.added ?? 0 }) : state === "running" ? r.srRunning : state === "error" ? r.srError : r.srQueued}
                  </span>
                </li>
              );
            })}
          </ul>
          {(skipped.length > 0 || skippedBlacklist > 0) && (
            <p className="text-xs text-muted" title={skipped.map((s) => s.label).join(", ")}>
              {skipped.length > 0 && fmt(r.skipped, { n: skipped.length })}
              {skipped.length > 0 && skippedBlacklist > 0 && " · "}
              {skippedBlacklist > 0 && fmt(r.skippedBlacklist, { n: skippedBlacklist })}
            </p>
          )}
          <div className="rounded-xl border border-dashed border-line-strong p-3">
            <p className="text-xs font-semibold text-ink-2">{r.linksTitle}</p>
            <p className="mb-2 text-xs text-muted">{r.linksHint}</p>
            <div className="flex flex-wrap gap-1.5">
              {links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                  <ExternalLink size={13} aria-hidden="true" /> <span aria-hidden="true">{l.flag}</span> {l.name}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
