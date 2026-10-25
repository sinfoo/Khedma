"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Archive,
  Bookmark,
  ChevronDown,
  Check,
  CircleCheck,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  MoreHorizontal,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Square,
  Undo2,
  UserSearch,
} from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { CompanyAvatar } from "@/components/kit";
import { Menu, MenuItem } from "@/components/kit/menu";
import { ScoreRing, scoreLabel } from "@/components/ui";
import { countryByCode, REMOTE_CODE } from "@/lib/geo";
import { contactSearchUrl } from "@/lib/links";
import { JOB_TYPES, type JobType } from "@/lib/types";
import { planSearch, runLabel, type Remote } from "@/lib/search/plan";
import type { FeedRowState } from "@/lib/repo/sources";
import { loadFeedState, saveScanOptions, widenScan } from "@/app/actions/sources";
import { applyTo, archiveOffers, evaluateOffer, tailorCvFor, trackOffers } from "@/app/actions/jobs";
import { Picks } from "./picks";
import { errorReason } from "./error-reason";
import { useScan, type FoundJob, type ScanDone, type ScanOutcome, type ScanSnapshot, type SourceStatus } from "./use-scan";

interface Src {
  id: number;
  label: string;
  kind: string;
}

const MAX_KW = 6;
/** Seconds per evaluation before the first one is timed (the score hint says about 20 s). */
const SCORE_GUESS_S = 20;

/**
 * The scan is the page: a radar stage (idle / running) that folds away when done,
 * and a live feed of kept offers with one recommended action per row.
 */
const FEED_KEY = "khedma:last-scan";

const split = (s: string) => s.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean);
const seconds = () => Date.now() / 1000;

export function ScanPanel({
  keywords,
  places,
  sources,
  autoStart,
  typed = false,
  cvKeywords = [],
  saved = { types: [], negatives: [] },
}: {
  keywords: string[];
  /** Keywords came from the user (a ?q= link), not from the CV. */
  typed?: boolean;
  places: { countries: string[]; remote: Remote };
  sources: Src[];
  /** Start at once: a search typed before the page hydrated (?q=). Every other entry point only focuses the form. */
  autoStart: boolean;
  /** Keywords read from the profile CV (roles, then main skills), for "Auto scan". */
  cvKeywords?: string[];
  /** Search options kept from the last scan. */
  saved?: { types: JobType[]; negatives: string[] };
}) {
  const { t, locale } = useT();
  const m = t.sources2.scan2;
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { start, attach, stop, restore, addJobs, running, status, total, finished, plan, jobs, dropped } = useScan();
  const [kw, setKw] = useState(keywords.join(", "));
  const [countries, setCountries] = useState<string[]>(places.countries);
  const [remote, setRemote] = useState<Remote>(places.remote);
  const [types, setTypes] = useState<JobType[]>(saved.types);
  const [negatives, setNegatives] = useState(saved.negatives.join(", "));
  const [options, setOptions] = useState(false);
  const [preparing, startPrepare] = useTransition();
  const [done, setDone] = useState<ScanDone | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [scoreTick, setScoreTick] = useState(0);
  const startedAt = useRef(0);
  const kwRef = useRef<HTMLInputElement>(null);
  const L = locale === "fr" ? "fr" : "en";
  const num = (n: number) => n.toLocaleString(locale);
  const countryName = (code: string) => (code === REMOTE_CODE ? t.common.remote : (countryByCode(code)?.[L] ?? code));

  // Clock in the stage header.
  useEffect(() => {
    if (!running || retrying) return;
    startedAt.current = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running, retrying]);

  const allTerms = split(kw);
  const terms = allTerms.slice(0, MAX_KW);
  const negList = split(negatives);
  const preview = planSearch({ keywords: terms, countries, remote, enabledSources: sources });
  // What this search asks for, shown while it runs and kept in its summary.
  const lookingFor = [terms.join(" · ") || "—", countries.map(countryName).join(", "), types.length ? types.map((ty) => t.jobTypes[ty]).join(", ") : "", negList.length ? fmt(m.without, { v: negList.join(", ") }) : ""].filter(Boolean);

  // Mirror of the live state for the async scan callbacks (a stopped scan is summed from it).
  const live = useRef({ jobs, status, dropped, plan });
  useEffect(() => {
    live.current = { jobs, status, dropped, plan };
  });

  /** What a stopped scan found so far, as a finished result. */
  const stoppedDone = (): ScanDone => {
    const { jobs: js, status: st, dropped: dr, plan: p } = live.current;
    const runs = p?.runs ?? [];
    return {
      type: "done",
      run_id: 0,
      added: js.length,
      errors: runs.filter((r) => st[r.key]?.state === "error").length,
      duplicates: runs.reduce((a, r) => a + (st[r.key]?.known ?? 0), 0),
      dropped: dr,
      jobs: [],
      stopped: true,
    };
  };

  const settle = (r: ScanOutcome, asked: boolean) => {
    if (r.kind === "done") {
      const retry = asked || !!r.done.retry;
      // A retry adds to the scan it retries; its widen counts cover the whole scan.
      setDone((d) => (retry && d ? { ...d, added: d.added + r.done.added, duplicates: d.duplicates + r.done.duplicates, widen: r.done.widen } : { ...r.done, searched: lookingFor.join(" · ") }));
      router.refresh();
    } else if (r.kind === "busy") toast.info(t.sources2.busy);
    else if (r.kind === "cancelled") setDone({ ...stoppedDone(), searched: lookingFor.join(" · ") });
    else if (r.kind === "error") setFailure(r.error);
  };

  const persistOptions = (next: { types?: JobType[]; negatives?: string[] }) => void saveScanOptions({ types: next.types ?? types, negatives: next.negatives ?? negList }).catch(() => {});

  /** `use`: scan with these keywords instead of the box's ("Auto scan" passes the CV's). `keys`: retry only these runs. */
  const run = (use?: string[], keys?: string[]) => {
    setFailure(null);
    if (keys) setRetrying(true);
    else {
      setDone(null);
      setElapsed(0);
    }
    startPrepare(async () => {
      const untouched = !use && !typed && terms.join(",").toLowerCase() === keywords.slice(0, MAX_KW).join(",").toLowerCase();
      const r = await start({ keywords: untouched ? undefined : (use ?? terms), countries, remote, types, negatives: negList, keys });
      // Another tab (or this page before a reload) is scanning: follow that scan instead.
      const followed = r.kind === "busy" && !keys ? await attach() : null;
      settle(followed ?? r, !!keys);
      setRetrying(false);
    });
  };

  // Back on the page while a scan still runs on the server: pick it up where it is.
  useEffect(() => {
    if (autoStart) return;
    void attach().then((r) => {
      if (!r || r.kind === "busy") return; // busy = this page already follows it (dev runs effects twice)
      setElapsed(0);
      settle(r, false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opening an offer and coming back must not lose the results: keep the last finished scan for this tab.
  useEffect(() => {
    if (autoStart) return;
    try {
      const snap = JSON.parse(sessionStorage.getItem(FEED_KEY) ?? "null") as (ScanSnapshot & { done: ScanDone; elapsed?: number }) | null;
      if (!snap?.done) return;
      restore(snap);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage only exists after hydration
      setDone(snap.done);
      setElapsed(snap.elapsed ?? 0);
    } catch {
      // private mode or bad JSON: start empty
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!done || running) return;
    try {
      sessionStorage.setItem(FEED_KEY, JSON.stringify({ jobs, plan, status, done, elapsed }));
    } catch {
      // storage full or blocked: nothing to keep
    }
  }, [done, running, jobs, plan, status, elapsed]);

  const kicked = useRef(false);
  useEffect(() => {
    if (!autoStart || kicked.current) return;
    kicked.current = true;
    window.history.replaceState(null, "", "/app/sources");
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Scan buttons elsewhere (topbar, palette, Offers, Discover) link to ?scan=1: show the form with the keywords focused.
  const focusAsked = params.get("scan") === "1";
  useEffect(() => {
    if (!focusAsked) return;
    router.replace("/app/sources", { scroll: false });
    const el = kwRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.focus();
  }, [focusAsked, router]);

  const busy = running || preparing;
  const scanning = busy && plan !== null && !retrying;
  const finishedAll = done !== null && (!busy || retrying);
  const showStage = !finishedAll;
  const showFeed = scanning || finishedAll || jobs.length > 0;

  // Blips: planned runs while scanning or after; the runs a scan would make when idle (same count as the scan).
  const blips: { key: string; label: string; kind: string; st?: SourceStatus }[] = (plan?.runs ?? preview.runs).map((r) => ({ key: r.key, label: runLabel(r, L), kind: r.kind, st: plan ? status[r.key] : undefined }));
  const current = blips.find((b) => b.st?.state === "running");
  const sums = blips.reduce(
    (acc, b) => ({ listed: acc.listed + (b.st?.listed ?? 0), kept: acc.kept + (b.st?.kept ?? b.st?.added ?? 0), errors: acc.errors + (b.st?.state === "error" ? 1 : 0) }),
    { listed: 0, kept: 0, errors: 0 },
  );
  const droppedTotal = Object.values(dropped).reduce((a, b) => a + b, 0);
  const kept = jobs.length;
  const pct = total ? Math.round((finished / total) * 100) : 0;

  const title = scanning ? fmt(m.titleRunning, { n: total }) : finishedAll ? (jobs.length === 0 ? m.titleDoneNone : jobs.length === 1 ? m.titleDoneOne : fmt(m.titleDone, { n: jobs.length })) : m.titleIdle;
  const lead = scanning ? m.leadRunning : finishedAll ? (jobs.length ? m.leadDone : m.leadDoneNone) : m.leadIdle;
  const announce = failure ? fmt(m.failedScan, { reason: errorReason(t, failure) }) : scanning ? title : finishedAll ? `${title}. ${lead}` : "";

  const onWiden = async (w: "type" | "age") => {
    const r = await widenScan(w);
    if (r === null) return toast.info(m.widenExpired);
    setDone((d) => (d ? { ...d, added: d.added + r.length, widen: d.widen ? { ...d.widen, [w]: 0 } : undefined } : d));
    if (!r.length) return toast.info(m.widenNone);
    addJobs(r);
    setScoreTick((n) => n + 1);
    toast.success(fmt(m.widened, { n: r.length }));
  };

  const searchForm = (
    <form
      action="/app/sources"
      method="get"
      className={finishedAll ? "card mb-5 px-[18px] py-3.5" : "mx-[18px] mt-[18px] rounded-xl bg-surface-2 px-4 py-3"}
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && preview.runs.length) run();
      }}
    >
      <label htmlFor="scan-kw" className="label !text-[0.75rem]">{m.searchFor}</label>
      <div className="flex gap-1.5">
        <input ref={kwRef} id="scan-kw" name="q" value={kw} onChange={(e) => setKw(e.target.value)} disabled={busy} placeholder={m.keywordsPh} aria-describedby="scan-kw-hint" className="input !h-10 min-w-0 flex-1 !py-0 text-[0.95rem]" />
        <button type="submit" className="btn btn-saffron !h-10" disabled={busy || preview.runs.length === 0}>
          <Radar size={15} aria-hidden="true" /> {m.scan}
        </button>
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[0.72rem] text-muted" role="group" aria-label={m.countries}>
        {places.countries.map((code) => {
          const on = countries.includes(code);
          return (
            <button key={code} type="button" aria-pressed={on} disabled={busy} className={`chip !h-6 cursor-pointer !py-0 text-[0.7rem] ${on ? "chip-accent" : "opacity-70"}`} onClick={() => setCountries((cs) => (on ? (cs.length > 1 ? cs.filter((x) => x !== code) : cs) : [...cs, code]))}>
              {countryName(code)}
            </button>
          );
        })}
        <Link href="/app/profile" className="ml-1 font-semibold text-accent-text">{m.addCountry}</Link>
      </p>
      <p id="scan-kw-hint" className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[0.72rem] text-muted">
        <span>{keywords.length ? fmt(m.fromCv, { kw: keywords.join(", ") }) : preview.runs.length ? fmt(m.ready, { n: preview.runs.length }) : m.noSources}</span>
        {allTerms.length > MAX_KW && <span className="font-semibold text-saffron">{fmt(m.kwCap, { n: MAX_KW })}</span>}
        {keywords.length > 0 && kw !== keywords.join(", ") && (
          <button type="button" className="font-semibold text-accent-text" onClick={() => setKw(keywords.join(", "))}>{m.useCv}</button>
        )}
        <button type="button" className="ml-auto inline-flex items-center gap-1 font-semibold text-accent-text" aria-expanded={options} aria-controls="scan-options" onClick={() => setOptions((o) => !o)}>
          <Settings2 size={12} aria-hidden="true" /> {m.options}
          {(types.length > 0 || negList.length > 0) && <span className="chip chip-accent !h-4 !px-1.5 !py-0 text-[0.62rem]">{types.length + negList.length}</span>}
        </button>
      </p>
      {options && (
        <div id="scan-options" className="mt-2 space-y-2 rounded-xl border border-line bg-surface p-3 text-sm" style={{ animation: "pop .18s ease both" }}>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.offers2.searchBar.typesLabel}>
            <span className="eyebrow text-[0.68rem]" aria-hidden="true">{t.offers2.searchBar.typesLabel}</span>
            {JOB_TYPES.map((ty) => {
              const on = types.includes(ty);
              return (
                <button
                  key={ty}
                  type="button"
                  aria-pressed={on}
                  className={`chip min-h-7 cursor-pointer ${on ? "chip-accent" : ""}`}
                  onClick={() => {
                    const next = on ? types.filter((x) => x !== ty) : [...types, ty];
                    setTypes(next);
                    persistOptions({ types: next });
                  }}
                >
                  {t.jobTypes[ty]}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2">
              <span className="eyebrow text-[0.68rem]">{t.offers2.searchBar.remoteLabel}</span>
              <select id="scan-remote" className="input !h-8 !w-auto !py-0 text-sm" value={remote} onChange={(e) => setRemote(e.target.value as Remote)}>
                {(["yes", "only", "no"] as const).map((r) => (
                  <option key={r} value={r}>{t.offers2.searchBar.remoteOpts[r]}</option>
                ))}
              </select>
            </label>
            <label className="flex min-w-48 flex-1 items-center gap-2">
              <span className="eyebrow shrink-0 text-[0.68rem]">{t.offers2.searchBar.negatives}</span>
              <input id="scan-negatives" className="input !h-8 min-w-0 flex-1 !py-0 text-sm" value={negatives} placeholder={t.offers2.searchBar.negativesPh} onChange={(e) => setNegatives(e.target.value)} onBlur={() => persistOptions({})} />
            </label>
          </div>
          <p className="text-[0.75rem] text-muted">
            {m.optionsSaved} <Link href="/app/sources/preferences" className="font-semibold text-accent-text">{m.prefsLink}</Link>
          </p>
        </div>
      )}
    </form>
  );

  return (
    <>
      <header className="mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-[1.1] tracking-[-0.025em] sm:text-[2rem]">{title}</h1>
          <p className="mt-1.5 text-muted">{lead}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(busy || finishedAll) && (
            // One element for Stop / Scanning / Scan again, so keyboard focus is not lost when the scan ends.
            <button type="button" className="btn btn-outline" disabled={!running && (busy || preview.runs.length === 0)} aria-busy={busy && !running} onClick={() => (running ? stop() : run())}>
              {running ? <Square size={15} aria-hidden="true" /> : busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
              {running ? m.stop : busy ? m.scanning : m.scanAgain}
            </button>
          )}
          {!busy && (
            // Reads the profile CV: its roles and main skills become the keywords, shown in the box, then scans.
            <button
              type="button"
              className="btn btn-primary"
              disabled={!cvKeywords.length || preview.runs.length === 0}
              title={cvKeywords.length ? fmt(m.autoCvTitle, { kw: cvKeywords.join(", ") }) : m.autoCvNone}
              onClick={() => {
                setKw(cvKeywords.join(", "));
                run(cvKeywords);
              }}
            >
              <Sparkles size={15} aria-hidden="true" /> {m.autoCv}
            </button>
          )}
          <Link href="/app/sources/manage#catalog" className="btn btn-outline">
            <Plus size={15} aria-hidden="true" /> {m.addSource}
          </Link>
        </div>
      </header>
      {/* Stays mounted: start, end and failure of the scan are announced even when the stage folds away. */}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      {failure && (
        <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle size={16} aria-hidden="true" />
          <span className="flex-1">{fmt(m.failedScan, { reason: errorReason(t, failure) })}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => run()}>
            <RotateCcw size={13} aria-hidden="true" /> {m.retry}
          </button>
        </div>
      )}

      {finishedAll && searchForm}

      <div className={`grid items-stretch gap-5 ${showStage && showFeed ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" : ""}`} style={{ transition: "grid-template-columns .5s cubic-bezier(.2,.7,.2,1)" }}>
        {showStage && (
          <section aria-busy={scanning} aria-label={m.stageLabel} className="card relative flex flex-col overflow-hidden sm:min-h-[520px]">
            <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-3.5">
              {scanning ? <Loader2 size={16} className="animate-spin text-accent-text" aria-hidden="true" /> : <Radar size={16} className="text-muted" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className="text-[0.95rem] font-semibold">{scanning ? (current ? fmt(m.reading, { label: current.label }) : m.waiting) : preview.runs.length ? fmt(m.ready, { n: preview.runs.length }) : m.noSources}</p>
                <p className="mt-px text-[0.75rem] text-muted">{scanning ? fmt(m.feedSub, { n: kept, done: finished, total }) : t.sources2.respect}</p>
              </div>
              <span className="mono whitespace-nowrap text-[0.75rem] text-muted">{scanning ? `${elapsed} s` : ""}</span>
            </div>

            {!scanning && searchForm}
            <div className="grid items-center gap-[18px] px-[18px] pb-2 pt-[18px] md:grid-cols-[auto_minmax(0,1fr)]">
              {/* Radar: 3 rings, sweep, one blip per source. Decorative, so phones skip it and see the feed sooner. */}
              <div aria-hidden="true" className="relative mx-auto hidden size-[300px] place-items-center sm:grid">
                <span className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--accent) 6%, transparent), transparent 70%)" }} />
                <span className="absolute inset-0 rounded-full border border-line" style={{ animation: "ring-in .6s cubic-bezier(.2,.7,.2,1) both" }} />
                <span className="absolute inset-[17%] rounded-full border border-dashed border-line" style={{ animation: "ring-in .6s cubic-bezier(.2,.7,.2,1) .1s both" }} />
                <span className="absolute inset-[34%] rounded-full border border-line" style={{ animation: "ring-in .6s cubic-bezier(.2,.7,.2,1) .2s both" }} />
                <span className="absolute bottom-0 left-1/2 top-0 w-px bg-line opacity-60" />
                <span className="absolute left-0 right-0 top-1/2 h-px bg-line opacity-60" />
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "conic-gradient(from 0deg, color-mix(in oklab, var(--accent) 50%, transparent), color-mix(in oklab, var(--accent) 12%, transparent) 40deg, transparent 80deg)",
                    animation: scanning ? "sweep 2.4s linear infinite" : "none",
                    opacity: scanning ? 1 : 0.18,
                    transition: "opacity .6s",
                  }}
                />
                {blips.map((b, i) => {
                  const angle = (i / Math.max(1, blips.length)) * 360 - 90;
                  // Neighbours alternate between two orbits past 14 sources, so dots never touch.
                  const radius = blips.length > 14 && i % 2 ? 96 : 132;
                  const state = b.st?.state ?? (scanning ? "queued" : "idle");
                  const bg = state === "done" ? "var(--success-soft)" : state === "error" ? "var(--danger-soft)" : state === "running" ? "var(--accent)" : "var(--surface-2)";
                  const fg = state === "done" ? "var(--success)" : state === "error" ? "var(--danger)" : state === "running" ? "var(--accent-ink)" : "var(--muted)";
                  const ring = state === "done" ? "var(--success)" : state === "error" ? "var(--danger)" : state === "running" ? "var(--accent)" : "var(--line-strong)";
                  const size = state === "running" ? 28 : 22;
                  return (
                    <span key={b.key} className="absolute left-1/2 top-1/2 h-0 w-0" style={{ transform: `rotate(${angle}deg)` }}>
                      <span className="absolute top-0 grid place-items-center" style={{ left: radius, transform: `translate(-50%,-50%) rotate(${-angle}deg)` }}>
                        <span
                          className="relative grid place-items-center rounded-full text-[0.55rem] font-bold tracking-[0.02em]"
                          style={{ width: size, height: size, background: bg, color: fg, boxShadow: `inset 0 0 0 1px ${ring}`, transition: "all .35s cubic-bezier(.2,.7,.2,1)" }}
                        >
                          {monogram(b.label)}
                          {state === "running" && <span className="absolute -inset-[3px] rounded-full border-2 border-accent" style={{ animation: "ping 1.2s ease-out infinite" }} />}
                        </span>
                      </span>
                    </span>
                  );
                })}
                <div className="relative grid size-[84px] place-items-center rounded-full transition-colors" style={{ background: kept ? "var(--accent-soft)" : "var(--surface-2)", animation: "fade .5s ease .4s both" }}>
                  <span key={kept} className="display tabular text-[2rem] leading-none" style={{ color: kept ? "var(--accent-text)" : "var(--ink)", animation: "count .3s ease both" }}>
                    {kept}
                  </span>
                  <span className="eyebrow text-[0.58rem] tracking-[0.1em]">{m.kept}</span>
                </div>
              </div>

              {/* Now reading + tallies */}
              <div className="flex min-w-0 flex-col gap-2.5">
                {scanning && current && (
                  <div className="flex items-center gap-2.5 rounded-xl bg-accent-soft px-3 py-2.5" style={{ animation: "pop .25s ease both" }}>
                    <CompanyAvatar name={current.label} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.82rem] font-semibold text-accent-text">{fmt(m.reading, { label: current.label })}</p>
                      <p className="truncate text-[0.72rem] text-muted">{fmt(m.readingDetail, { listed: num(sums.listed) })}</p>
                    </div>
                  </div>
                )}
                {!scanning && (
                  <div>
                    <p className="eyebrow text-[0.68rem]">{m.nextTitle}</p>
                    <ol className="mt-2 space-y-2 text-[0.85rem]">
                      {m.idleSteps.map((x, i) => (
                        <li key={x} className="flex items-start gap-2.5">
                          <span className="mono grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[0.7rem] font-semibold text-accent-text">{i + 1}</span>
                          <span className="text-ink-2">{x}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {scanning && (
                  <dl className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: m.tallies.listed, v: sums.listed, color: "var(--ink)" },
                      { label: m.tallies.kept, v: kept, color: "var(--success)" },
                      { label: m.tallies.dropped, v: droppedTotal, color: "var(--ink-2)" },
                      { label: m.tallies.errors, v: sums.errors, color: sums.errors ? "var(--danger)" : "var(--ink-2)" },
                    ].map((x) => (
                      <div key={x.label} className="rounded-[10px] border border-line px-2.5 py-2">
                        <dt className="eyebrow text-[0.66rem]">{x.label}</dt>
                        <dd className="display tabular mt-0.5 text-[1.15rem] leading-none" style={{ color: x.color }}>{num(x.v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {scanning && (
                  <div>
                    <div className="bar">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 text-[0.72rem] text-muted">
                      {m.lookingFor} <span className="mono text-ink-2">{lookingFor.join(" · ")}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {scanning && <SourceList blips={blips} summary={fmt(m.feedSub, { n: kept, done: finished, total })} />}
          </section>
        )}

        {finishedAll && <Picks ids={jobs.map((j) => j.id)} refreshKey={String(scoreTick)} />}
        {finishedAll && plan && <SourceResults blips={blips} busy={busy} onRetry={(keys) => run(undefined, keys)} />}

        {showFeed && (
          <Feed
            jobs={jobs}
            scanning={scanning}
            done={finishedAll ? done : null}
            listed={sums.listed}
            dropped={droppedTotal}
            droppedBy={dropped}
            skipped={plan?.skipped.length ?? 0}
            skippedBlacklist={plan?.skippedBlacklist ?? 0}
            elapsed={elapsed}
            finished={finished}
            total={total}
            lookingFor={lookingFor.join(" · ")}
            onScored={() => setScoreTick((n) => n + 1)}
            onWiden={onWiden}
          />
        )}
      </div>
    </>
  );
}

function monogram(label: string): string {
  const words = label.replace(/\(.*?\)/g, " ").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const a = words[0] ?? "?";
  return (words.length > 1 ? a[0] + words[1][0] : a.slice(0, 2)).toUpperCase();
}

type Blip = { key: string; label: string; st?: SourceStatus };

/** Every planned source with its result, folded by default so the radar stays the focus. */
function SourceList({ blips, summary, open = false }: { blips: Blip[]; summary: string; open?: boolean }) {
  const { t } = useT();
  const s = t.sources2.radar;
  return (
    <details className="group mt-auto border-t border-line px-[18px] py-2.5" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[0.75rem] font-semibold text-ink-2">
        <ChevronDown size={13} className="transition-transform group-open:rotate-180" aria-hidden="true" /> {summary}
      </summary>
      <ul aria-label={s.sourcesLabel} className="mt-2 flex flex-wrap gap-1.5">
        {blips.map((b) => {
          const state = b.st?.state;
          const cls = state === "done" ? "border-transparent bg-success-soft text-success" : state === "running" ? "border-transparent bg-accent-soft text-accent-text" : state === "error" ? "border-transparent bg-danger-soft text-danger" : "border-line bg-surface text-ink-2";
          const dot = state === "done" ? "var(--success)" : state === "running" ? "var(--accent)" : state === "error" ? "var(--danger)" : "var(--line-strong)";
          const partial = state === "done" && b.st?.warning ? `${s.srPartial}: ${errorReason(t, b.st.warning)}` : undefined;
          const sr = state === "done" ? `${fmt(s.srKept, { n: b.st?.added ?? 0 })}${partial ? ` (${partial})` : ""}` : state === "error" ? `${s.srError}: ${errorReason(t, b.st?.error)}` : state === "running" ? s.srRunning : s.srQueued;
          return (
            <li key={b.key} className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border pl-1.5 pr-2 text-[0.7rem] font-semibold transition-all ${cls}`} title={state === "error" ? errorReason(t, b.st?.error) : partial}>
              <span className="size-1.5 rounded-full" style={{ background: dot }} aria-hidden="true" />
              {b.label}
              {state === "done" && <span className="mono opacity-80" aria-hidden="true">+{b.st?.added ?? 0}{partial ? " !" : ""}</span>}
              <span className="sr-only">: {sr}</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** After the scan: failed sources stay in view with their reason and a Retry; the full list folds below. */
function SourceResults({ blips, busy, onRetry }: { blips: Blip[]; busy: boolean; onRetry: (keys: string[]) => void }) {
  const { t } = useT();
  const m = t.sources2.scan2;
  const failed = blips.filter((b) => b.st?.state === "error");
  const retrying = blips.filter((b) => b.st?.state === "running" || b.st?.state === "queued");
  return (
    <section aria-label={m.sourcesTitle} className="card py-1">
      {failed.length + retrying.length > 0 && (
        <div className="border-b border-line px-[18px] py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-[0.85rem] font-semibold">{failed.length ? fmt(failed.length === 1 ? m.failedOne : m.failedTitle, { n: failed.length }) : m.retryingNow}</p>
            {failed.length > 1 && (
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => onRetry(failed.map((b) => b.key))}>
                <RotateCcw size={13} aria-hidden="true" /> {m.retryAll}
              </button>
            )}
          </div>
          <ul className="mt-2 space-y-1.5">
            {[...retrying, ...failed].map((b) => (
              <li key={b.key} className="flex items-center gap-2 text-[0.82rem]">
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: b.st?.state === "error" ? "var(--danger)" : "var(--accent)" }} aria-hidden="true" />
                <span className="font-semibold">{b.label}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{b.st?.state === "error" ? errorReason(t, b.st.error) : m.retryingNow}</span>
                {b.st?.state === "error" ? (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} aria-label={`${m.retry}: ${b.label}`} onClick={() => onRetry([b.key])}>
                    <RotateCcw size={13} aria-hidden="true" /> {m.retry}
                  </button>
                ) : (
                  <Loader2 size={14} className="animate-spin text-muted" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <SourceList blips={blips} summary={fmt(m.sourcesRead, { n: blips.length, errors: failed.length })} />
    </section>
  );
}

// ---------- live feed ----------
/** Server row state plus what this page changed since (optimistic). */
type RowState = Partial<FeedRowState>;

function Feed({
  jobs,
  scanning,
  done,
  listed,
  dropped,
  droppedBy,
  skipped,
  skippedBlacklist,
  elapsed,
  finished,
  total,
  lookingFor,
  onScored,
  onWiden,
}: {
  jobs: FoundJob[];
  scanning: boolean;
  done: ScanDone | null;
  listed: number;
  dropped: number;
  droppedBy: Record<string, number>;
  skipped: number;
  skippedBlacklist: number;
  elapsed: number;
  finished: number;
  total: number;
  lookingFor: string;
  onScored: () => void;
  onWiden: (w: "type" | "age") => Promise<unknown>;
}) {
  const { t, locale } = useT();
  const m = t.sources2.scan2;
  const toast = useToast();
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [widening, startWiden] = useTransition();
  const num = (n: number) => n.toLocaleString(locale);
  const ids = jobs.map((j) => j.id).join(",");

  // Scores, tracked state and skips come from the database: a restored feed shows them as they are now.
  useEffect(() => {
    if (scanning || !ids) return;
    let live = true;
    loadFeedState(ids.split(",").map(Number))
      .then((st) => live && setRows((r) => ({ ...st, ...Object.fromEntries(Object.entries(r).filter(([id]) => !(id in st))) })))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ids, scanning]);

  // One clock reading per mount: deadline chips must not change between renders.
  const [now] = useState(() => Date.now());
  const [scoringAll, setScoringAll] = useState<{ i: number; n: number; per: number } | null>(null);
  const cancelAll = useRef(false);
  const patch = (id: number, p: RowState) => setRows((s) => ({ ...s, [id]: { ...s[id], ...p } }));
  // Best keyword match first, fixed once the scan is over: scoring or skipping never moves a row under the pointer.
  const sorted = useMemo(() => (scanning ? jobs : [...jobs].sort((a, b) => b.relevance - a.relevance || a.id - b.id)), [jobs, scanning]);
  const show = scanning || jobs.length > 0 || done !== null;
  const open = (j: FoundJob) => !rows[j.id]?.archived;
  const unscored = jobs.filter((j) => !rows[j.id]?.ev && open(j));
  const strong = jobs.filter((j) => open(j) && rows[j.id]?.appId == null && (rows[j.id]?.ev?.verdict === "apply_now" || rows[j.id]?.ev?.verdict === "apply"));
  const nTracked = jobs.filter((j) => rows[j.id]?.appId != null).length;
  const nScored = jobs.filter((j) => rows[j.id]?.ev).length;

  // Leaving mid "Score all" would silently stop it: ask first.
  useEffect(() => {
    if (!scoringAll) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [scoringAll]);

  const scoreOne = async (j: FoundJob) => {
    setPending((s) => new Set(s).add(j.id));
    const r = await evaluateOffer(j.id);
    setPending((s) => {
      const n = new Set(s);
      n.delete(j.id);
      return n;
    });
    if (r.ok && r.global !== undefined && r.verdict) {
      patch(j.id, { ev: { global: r.global, verdict: r.verdict, engine: r.engine ?? "heuristic", triage: r.triaged ? { verdict: r.triaged.verdict, skipped: r.triaged.skipped, reason: r.triaged.reason } : undefined } });
      onScored();
    } else toast.error(t.common.error);
  };
  const scoreAll = async () => {
    const items = unscored.filter((j) => !pending.has(j.id));
    cancelAll.current = false;
    const t0 = seconds();
    for (let i = 0; i < items.length && !cancelAll.current; i++) {
      // Seconds per offer so far (a first guess before one is done), for the "~N min left".
      setScoringAll({ i: i + 1, n: items.length, per: i ? (seconds() - t0) / i : SCORE_GUESS_S });
      await scoreOne(items[i]);
    }
    setScoringAll(null);
  };
  const minLeft = scoringAll ? Math.ceil(((scoringAll.n - scoringAll.i + 1) * scoringAll.per) / 60) : 0;
  const left = minLeft <= 1 ? m.scoreLeftSoon : fmt(m.scoreLeft, { n: minLeft });
  const trackMany = async (list: number[]) => {
    const n = await trackOffers(list);
    if (n) {
      for (const id of list) patch(id, { appId: rows[id]?.appId ?? -1 });
      toast.success(fmt(t.offers2.toastTracked, { n }));
    } else toast.error(t.common.error);
  };
  // One kind of Skip everywhere: the offer is archived, and Undo brings it back.
  const unskip = async (j: FoundJob) => {
    patch(j.id, { archived: false });
    if (!(await archiveOffers([j.id], false))) toast.error(t.common.error);
  };
  const skip = async (j: FoundJob) => {
    patch(j.id, { archived: true });
    if (await archiveOffers([j.id], true)) toast.info(m.skippedToast, j.title, { label: m.undo, onClick: () => void unskip(j) });
    else {
      patch(j.id, { archived: false });
      toast.error(t.common.error);
    }
  };

  const reasons = Object.entries(droppedBy).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const notes = [
    skipped ? fmt(m.sourcesSkipped, { n: skipped }) : "",
    skippedBlacklist ? fmt(t.sources2.radar.skippedBlacklist, { n: skippedBlacklist }) : "",
    done?.closed ? fmt(m.closedRemoved, { n: done.closed }) : "",
  ].filter(Boolean);
  const w = done?.widen;

  return (
    // overflow-clip, not hidden: the done banner below stays sticky while the list scrolls.
    <section aria-label={m.feedLabel} className="card flex flex-col overflow-clip" style={{ minHeight: done && !jobs.length ? 0 : show ? 520 : 320 }}>
      {done && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-line bg-bg-elev px-[18px] py-3.5" style={{ animation: "pop .35s cubic-bezier(.2,.7,.2,1) .25s both" }}>
          <span className="tile tile-sm tone-success !size-10 !rounded-xl" style={{ animation: "land .6s cubic-bezier(.2,.7,.2,1) .3s both" }}>
            <CircleCheck size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="text-[1.05rem] tracking-[-0.01em]">{fmt(m.feedAll, { n: jobs.length })}</h2>
            <p className="mt-0.5 text-[0.8rem] text-muted">
              {fmt(m.summary2, { listed: num(listed), dupes: num(done.duplicates), dropped: num(dropped), s: elapsed })}
              {done.stopped && ` ${m.stoppedNote}`}
            </p>
            <p className="mt-0.5 text-[0.75rem] text-muted">{fmt(m.searchedFor, { v: done.searched ?? lookingFor })}</p>
            {reasons.length > 0 && (
              <p className="mt-0.5 text-[0.75rem] text-muted">
                {m.droppedBecause} {reasons.map(([k, n]) => `${t.sources2.radar.reasons[k as keyof typeof t.sources2.radar.reasons] ?? k} ${num(n)}`).join(" · ")}
              </p>
            )}
            {notes.length > 0 && <p className="mt-0.5 text-[0.75rem] text-muted">{notes.join(" · ")}</p>}
            {w && (w.type > 0 || w.age > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={m.widenLabel}>
                {w.type > 0 && (
                  <button type="button" className="btn btn-outline btn-sm" disabled={widening} onClick={() => startWiden(async () => void (await onWiden("type")))}>
                    <Plus size={13} aria-hidden="true" /> {fmt(m.widenType, { n: num(w.type), types: w.types.map((ty) => t.jobTypes[ty as JobType] ?? ty).join(", ") || m.otherTypes })}
                  </button>
                )}
                {w.age > 0 && (
                  <button type="button" className="btn btn-outline btn-sm" disabled={widening} onClick={() => startWiden(async () => void (await onWiden("age")))}>
                    <Plus size={13} aria-hidden="true" /> {fmt(m.widenAge, { n: num(w.age) })}
                  </button>
                )}
                {widening && <Loader2 size={14} className="animate-spin self-center text-muted" aria-label={t.common.loading} />}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {scoringAll ? (
              <>
                <span className="text-[0.78rem] text-muted" aria-live="polite">
                  <Loader2 size={13} className="mr-1 inline animate-spin" aria-hidden="true" />
                  {fmt(m.scoreAllRunning, scoringAll)} · {left}
                </span>
                <button type="button" className="btn btn-outline !h-9" onClick={() => (cancelAll.current = true)}>
                  <Square size={13} aria-hidden="true" /> {m.scoreCancel}
                </button>
              </>
            ) : (
              unscored.length > 0 && (
                <button type="button" className="btn btn-outline !h-9" title={m.scoreHint} onClick={() => void scoreAll()}>
                  <Sparkles size={14} aria-hidden="true" /> {fmt(m.scoreAll, { n: unscored.length })}
                </button>
              )
            )}
            {strong.length > 0 && (
              <button type="button" className="btn btn-outline !h-9" onClick={() => void trackMany(strong.map((j) => j.id))}>
                <Bookmark size={14} aria-hidden="true" /> {fmt(m.trackGood, { n: strong.length })}
              </button>
            )}
          </div>
        </div>
      )}
      {!done && show && (
        <div className="flex items-center justify-between border-b border-line px-[18px] py-3.5">
          <h2 className="card-title">{m.feedLive}</h2>
          <span className="text-[0.78rem] text-muted">{fmt(m.feedSub, { n: jobs.length, done: finished, total })}</span>
        </div>
      )}
      {jobs.length === 0 ? (
        !done && (
          <div className="grid flex-1 place-items-center p-10 text-center text-[0.9rem] text-muted">
            <div>
              <Inbox size={28} className="mx-auto mb-2 text-line-strong" aria-hidden="true" />
              <p>{m.feedEmpty}</p>
            </div>
          </div>
        )
      ) : (
        <ul className="flex flex-1 flex-col gap-1.5 p-2">
          {sorted.map((j) => (
            <FeedRow
              key={j.id}
              job={j}
              now={now}
              row={rows[j.id] ?? {}}
              scoring={pending.has(j.id)}
              busyAll={!!scoringAll}
              scoreOne={() => void scoreOne(j)}
              trackOne={() => trackMany([j.id])}
              skip={() => void skip(j)}
              unskip={() => void unskip(j)}
            />
          ))}
        </ul>
      )}
      {done && jobs.length > 0 && (
        <div className="flex items-center gap-3 border-t border-line px-[18px] py-3 text-[0.82rem] text-muted">
          <span className="flex-1">{fmt(m.footer, { kept: jobs.length, tracked: nTracked, scored: nScored })}</span>
          <Link href="/app/jobs" className="whitespace-nowrap font-semibold">{m.allOffers}</Link>
          <Link href="/app/pipeline" className="whitespace-nowrap font-semibold">{m.pipeline}</Link>
        </div>
      )}
    </section>
  );
}

function FeedRow({
  job: j,
  now,
  row,
  scoring,
  busyAll,
  scoreOne,
  trackOne,
  skip,
  unskip,
}: {
  job: FoundJob;
  now: number;
  row: RowState;
  scoring: boolean;
  busyAll: boolean;
  scoreOne: () => void;
  trackOne: () => Promise<void>;
  skip: () => void;
  unskip: () => void;
}) {
  const { t, locale } = useT();
  const m = t.sources2.scan2;
  const r = t.offers2.results;
  const [, start] = useTransition();
  const [applying, startApply] = useTransition();
  const ev = row.ev ?? null;
  const tracked = row.appId != null;
  const skipped = !!row.archived;
  // The evaluation's own verdict, not thresholds on its score: a heuristic or triaged "skip" reads as such.
  const strong = ev?.verdict === "apply_now" || ev?.verdict === "apply";
  const estimate = ev?.engine === "heuristic";
  const suspicious = j.trust < 60;
  const why = j.why.slice(0, 2);
  const d = j.deadline ? Math.ceil((new Date(j.deadline).getTime() - now) / 86_400_000) : null;
  const dfg = d === null ? "" : d <= 3 ? "var(--danger)" : d <= 7 ? "var(--saffron)" : "var(--ink-2)";
  const border = tracked ? "var(--success)" : strong ? "color-mix(in oklab, var(--accent) 45%, var(--line))" : "var(--line)";
  const bg = tracked ? "color-mix(in oklab, var(--success-soft) 45%, var(--surface))" : "var(--surface)";
  const scoreText = ev ? ev.global.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "";

  return (
    <li
      className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-xl border px-3.5 py-3 sm:grid-cols-[auto_1fr_auto]"
      style={{ borderColor: border, background: bg, opacity: skipped ? 0.55 : 1, animation: "slide-in .4s cubic-bezier(.2,.7,.2,1) both", transition: "opacity .3s, border-color .3s, background .3s" }}
    >
      <CompanyAvatar name={j.company} size={40} />
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2">
          <Link href={`/app/jobs/${j.id}`} className="truncate text-[0.95rem] font-semibold text-ink hover:text-accent-text">{j.title}</Link>
          {tracked && (
            <span className="chip chip-success !py-px text-[0.68rem]" style={{ animation: "pop .3s ease both" }}>
              <Check size={10} aria-hidden="true" /> {m.tracked}
            </span>
          )}
          {skipped && <span className="chip !py-px text-[0.68rem] text-muted">{m.skipped}</span>}
          {suspicious && (
            <span className="chip chip-danger !py-px text-[0.68rem]" title={j.trustFlags.map((f) => r.flags[f as keyof typeof r.flags] ?? f).join(", ")}>
              <AlertTriangle size={10} aria-hidden="true" /> {r.suspicious}
            </span>
          )}
        </p>
        <p className="mt-px truncate text-[0.78rem] text-muted">
          {j.company}
          {j.location && ` · ${j.location}`}
          {j.remote && ` · ${t.common.remote}`} · {t.jobTypes[j.type as JobType] ?? j.type} · {t.offers2.list2.via} {j.source}
          {d !== null && (
            <>
              {" · "}
              <span className="font-semibold" style={{ color: d < 0 ? "var(--danger)" : dfg }}>{d < 0 ? m.expired : d === 0 ? r.urgentToday : fmt(r.urgent, { n: d })}</span>
            </>
          )}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {why.map((w) => (
            <span key={w} className="chip chip-success !py-px text-[0.7rem]">
              <Check size={10} aria-hidden="true" /> {whyText(t, locale, w)}
            </span>
          ))}
          {j.appliedHere && <span className="chip chip-saffron !py-px text-[0.7rem]">{fmt(r.appliedHere, { c: j.company })}</span>}
          {ev && (
            <Link
              href={`/app/jobs/${j.id}?tab=fit`}
              title={ev.triage?.skipped ? fmt(m.triaged, { reason: ev.triage.reason }) : fmt(m.seeWhy, { s: scoreText })}
              className={`inline-flex items-center gap-1.5 rounded-full py-px pl-0.5 pr-2 text-[0.72rem] font-semibold hover:underline ${strong ? "bg-accent-soft text-accent-text" : "bg-saffron-soft text-saffron"}`}
              style={{ animation: "pop .35s cubic-bezier(.2,.7,.2,1) both" }}
            >
              <ScoreRing value={ev.global} size={20} label={scoreLabel(t, ev.global)} animate={false} />
              {t.verdicts[ev.verdict]}
              {estimate && <span className="font-normal opacity-80">· {m.picks.basis.estimate}</span>}
            </Link>
          )}
        </p>
      </div>
      <div className="relative col-start-2 flex flex-wrap items-center justify-end gap-2 sm:col-start-3 sm:flex-col sm:items-end">
        {/* The keyword bar only until there is a verdict: two numbers side by side can disagree. */}
        {!ev && (
          <span title={m.matchTitle} className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.72rem] text-muted">
            <span className="bar !h-[5px] !w-11" aria-hidden="true">
              <span style={{ width: `${j.relevance}%` }} />
            </span>
            <span className="mono font-semibold text-ink-2">{j.relevance}%</span> {m.match}
          </span>
        )}
        {skipped ? (
          <button type="button" className="btn btn-outline btn-sm text-ink-2" onClick={unskip}>
            <Undo2 size={13} aria-hidden="true" /> {m.undo}
          </button>
        ) : (
          <div className="flex items-center gap-1.5" style={{ animation: "fade .3s ease .4s both" }}>
            {/* One clear next step on every row: apply. Scoring is optional and stays secondary. */}
            <button type="button" className="btn btn-primary btn-sm" disabled={applying} aria-busy={applying} onClick={() => startApply(async () => await applyTo(j.id))}>
              {applying ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Send size={13} aria-hidden="true" />} {m.apply}
            </button>
            {!ev && (
              <button type="button" className="btn btn-outline btn-sm text-ink-2" disabled={scoring || busyAll} aria-busy={scoring} onClick={scoreOne}>
                {scoring ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />} {scoring ? m.scoring : m.score}
              </button>
            )}
            <Menu label={m.more} trigger={<MoreHorizontal size={15} aria-hidden="true" />} triggerClassName="btn btn-outline btn-icon btn-sm text-ink-2">
              <MenuItem onClick={() => startApply(async () => await tailorCvFor(j.id))}><FileText size={14} aria-hidden="true" /> {m.tailor}</MenuItem>
              {!tracked && <MenuItem onClick={() => start(() => trackOne())}><Bookmark size={14} aria-hidden="true" /> {m.track}</MenuItem>}
              <MenuItem href={j.url}><ExternalLink size={14} aria-hidden="true" /> {m.openPosting}</MenuItem>
              <MenuItem href={contactSearchUrl(j.company)}><UserSearch size={14} aria-hidden="true" /> {m.contact}</MenuItem>
              {!tracked && (
                <MenuItem danger onClick={skip}><Archive size={14} aria-hidden="true" /> {m.skip}</MenuItem>
              )}
            </Menu>
          </div>
        )}
      </div>
    </li>
  );
}

function whyText(t: Dict, locale: string, code: string): string {
  const w = t.offers2.results.why;
  const i = code.indexOf(":");
  const k = i >= 0 ? code.slice(0, i) : code;
  const v = i >= 0 ? code.slice(i + 1) : "";
  switch (k) {
    case "title": return fmt(w.title, { v: v.replace(/,/g, ", ") });
    case "type": return t.jobTypes[v as JobType] ?? v;
    case "place": return countryByCode(v)?.[locale === "fr" ? "fr" : "en"] ?? v;
    case "desc": return fmt(w.desc, { v });
    case "fresh": return v === "0" ? w.freshToday : fmt(w.fresh, { v });
    case "remote": return w.remote;
    case "company": return w.company;
    case "junior": return w.junior;
    case "dup": return w.dup;
    case "tier": return w.tier;
    case "skills": return fmt(w.skills, { v: v.replace(/,/g, ", ") });
    default: return code;
  }
}
