"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Archive,
  Bookmark,
  Building2,
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
  SearchCheck,
  Settings2,
  Sparkles,
  UserSearch,
} from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { CompanyAvatar } from "@/components/kit";
import { Menu, MenuItem } from "@/components/kit/menu";
import { ScoreRing, scoreLabel } from "@/components/ui";
import { countryByCode, REMOTE_CODE } from "@/lib/geo";
import { contactSearchUrl } from "@/lib/links";
import { JOB_TYPES, type JobType } from "@/lib/types";
import { planSearch, type Remote } from "@/lib/search/plan";
import { DEFAULT_PREFS, type SearchPrefs } from "@/lib/search/prefs";
import { CATALOG } from "@/lib/sources/catalog";
import { loadSearchPrefs } from "@/app/actions/sources";
import { evaluateOffer, trackOffers } from "@/app/actions/jobs";
import { SearchPrefsForm } from "./search-prefs";
import { useAutoScan, useScan, type FoundJob, type ScanDone, type SourceStatus } from "./use-scan";

interface Src {
  id: number;
  label: string;
  kind: string;
}

const STRONG = 4;

/**
 * The scan is the page: a radar stage (idle / running) that folds away when done,
 * and a live feed of kept offers with one recommended action per row.
 */
export function ScanPanel({
  keywords,
  places,
  sources,
  autoStart,
}: {
  keywords: string[];
  places: { countries: string[]; remote: Remote };
  sources: Src[];
  autoStart: boolean;
}) {
  const { t, locale } = useT();
  const m = t.sources2.scan2;
  const toast = useToast();
  const router = useRouter();
  const { start, running, status, total, finished, plan, jobs, dropped } = useScan();
  const [kw, setKw] = useState(keywords.join(", "));
  const [countries, setCountries] = useState<string[]>(places.countries);
  const [remote, setRemote] = useState<Remote>(places.remote);
  const [types, setTypes] = useState<JobType[]>([]);
  const [negatives, setNegatives] = useState("");
  const [includeSenior, setIncludeSenior] = useState(false);
  const [options, setOptions] = useState(false);
  const [prefs, setPrefs] = useState<SearchPrefs | null>(null);
  const [preparing, startPrepare] = useTransition();
  const [done, setDone] = useState<ScanDone | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const L = locale === "fr" ? "fr" : "en";

  useEffect(() => {
    if (options && !prefs) loadSearchPrefs().then(setPrefs).catch(() => setPrefs(DEFAULT_PREFS));
  }, [options, prefs]);

  // Clock in the stage header.
  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const terms = kw.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
  const preview = planSearch({ keywords: terms, countries, remote, enabledSources: sources });

  const run = () => {
    setDone(null);
    setElapsed(0);
    startPrepare(async () => {
      const r = await start({ keywords: terms, countries, remote, types, negatives: negatives.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean), includeSenior });
      if (r.kind === "done") {
        setDone(r.done);
        router.refresh();
      } else if (r.kind === "busy") toast.info(t.sources2.busy);
      else if (r.kind === "error") toast.error(t.sources2.scanFailed, r.error);
    });
  };
  useAutoScan(start, (d) => {
    setDone(d);
    toast.success(fmt(t.sources2.auto.ran, { n: d.added }));
    router.refresh();
  });

  const kicked = useRef(false);
  useEffect(() => {
    if (!autoStart || kicked.current) return;
    kicked.current = true;
    window.history.replaceState(null, "", "/app/sources");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sources.length) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const busy = running || preparing;
  const scanning = busy && plan !== null;
  const finishedAll = !busy && done !== null;
  const showStage = !finishedAll;

  // Blips: planned runs while scanning or after; enabled sources when idle.
  const blips: { key: string; label: string; kind: string; st?: SourceStatus }[] = plan
    ? plan.runs.map((r) => ({ key: r.key, label: r.label, kind: r.kind, st: status[r.key] }))
    : sources.map((s) => ({ key: `${s.kind}:${s.id}`, label: s.label, kind: s.kind }));
  const current = blips.find((b) => b.st?.state === "running");
  const sums = blips.reduce(
    (acc, b) => ({ listed: acc.listed + (b.st?.listed ?? 0), kept: acc.kept + (b.st?.kept ?? b.st?.added ?? 0), errors: acc.errors + (b.st?.state === "error" ? 1 : 0) }),
    { listed: 0, kept: 0, errors: 0 },
  );
  const droppedTotal = Object.values(dropped).reduce((a, b) => a + b, 0);
  const kept = jobs.length;
  const pct = total ? Math.round((finished / total) * 100) : 0;
  const nTn = sources.filter((s) => CATALOG.find((c) => c.kind === s.kind)?.country === "TN").length;
  const nCareers = sources.filter((s) => ["greenhouse", "lever", "ashby", "rss", "careers"].includes(s.kind)).length;
  const nIntl = Math.max(0, sources.length - nTn - nCareers);

  const title = scanning ? fmt(m.titleRunning, { n: total }) : finishedAll ? (done!.added === 0 ? m.titleDoneNone : done!.added === 1 ? m.titleDoneOne : fmt(m.titleDone, { n: done!.added })) : m.titleIdle;
  const lead = scanning ? m.leadRunning : finishedAll ? m.leadDone : m.leadIdle;
  const sweepOn = scanning;

  return (
    <>
      <header className="mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-[1.1] tracking-[-0.025em] sm:text-[2rem]">{title}</h1>
          <p className="mt-1.5 text-muted">{lead}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-saffron" disabled={busy || preview.runs.length === 0} aria-busy={busy} onClick={run}>
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Radar size={15} aria-hidden="true" />}
            {busy ? m.scanning : finishedAll ? m.scanAgain : m.scan}
          </button>
          <a href="#catalog" className="btn btn-outline">
            <Plus size={15} aria-hidden="true" /> {m.addSource}
          </a>
        </div>
      </header>

      <div className={`grid items-stretch gap-5 ${showStage ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`} style={{ transition: "grid-template-columns .5s cubic-bezier(.2,.7,.2,1)" }}>
        {showStage && (
          <section aria-live="polite" aria-busy={scanning} className="card relative flex min-h-[520px] flex-col overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-3.5">
              {scanning ? <Loader2 size={16} className="animate-spin text-accent-text" aria-hidden="true" /> : <Radar size={16} className="text-muted" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.95rem] font-semibold">{scanning ? (current ? fmt(m.reading, { label: current.label }) : m.waiting) : sources.length ? fmt(m.ready, { n: sources.length }) : m.noSources}</p>
                <p className="mt-px text-[0.75rem] text-muted">{scanning ? fmt(m.feedSub, { n: kept, done: finished, total }) : t.sources2.respect}</p>
              </div>
              <span className="mono whitespace-nowrap text-[0.75rem] text-muted">{scanning ? `${elapsed} s` : ""}</span>
            </div>

            <div className="grid items-center gap-[18px] px-[18px] pb-2 pt-[18px] md:grid-cols-[auto_minmax(0,1fr)]">
              {/* Radar: 3 rings, sweep, one blip per source */}
              <div aria-hidden="true" className="relative mx-auto grid size-[300px] place-items-center">
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
                    animation: sweepOn ? "sweep 2.4s linear infinite" : "none",
                    opacity: sweepOn ? 1 : 0.18,
                    transition: "opacity .6s",
                  }}
                />
                {blips.map((b, i) => {
                  const angle = (i / Math.max(1, blips.length)) * 360 - 90;
                  const state = b.st?.state ?? (scanning ? "queued" : "idle");
                  const bg = state === "done" ? "var(--success)" : state === "error" ? "var(--danger)" : state === "running" ? "var(--accent)" : "var(--surface-3)";
                  const fg = state === "done" || state === "running" || state === "error" ? "#fff" : "var(--ink-2)";
                  const size = state === "running" ? 26 : 20;
                  return (
                    <span key={b.key} title={b.label} className="absolute left-1/2 top-1/2 h-0 w-0" style={{ transform: `rotate(${angle}deg)` }}>
                      <span className="absolute top-0 grid place-items-center" style={{ left: 124, transform: `translate(-50%,-50%) rotate(${-angle}deg)` }}>
                        <span
                          className="relative grid place-items-center rounded-full text-[0.6rem] font-bold"
                          style={{ width: size, height: size, background: bg, color: fg, boxShadow: `0 0 0 ${state === "running" ? 4 : 2}px ${state === "running" ? "color-mix(in oklab, var(--accent) 25%, transparent)" : "var(--surface)"}`, transition: "all .35s cubic-bezier(.2,.7,.2,1)" }}
                        >
                          {b.label.slice(0, 1).toUpperCase()}
                          {state === "running" && <span className="absolute -inset-[3px] rounded-full border-2 border-accent" style={{ animation: "ping 1.2s ease-out infinite" }} />}
                        </span>
                        {state === "running" && (
                          <span className="absolute top-[calc(100%+6px)] whitespace-nowrap rounded-md border border-line bg-surface px-1.5 py-px text-[0.68rem] font-semibold text-accent-text shadow-[var(--shadow-sm)]" style={{ animation: "pop .25s ease both" }}>
                            {b.label}
                          </span>
                        )}
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
                      <p className="truncate text-[0.82rem] font-semibold text-accent-text">{fmt(m.reading, { label: current.label })}</p>
                      <p className="truncate text-[0.72rem] text-muted">{fmt(m.readingDetail, { listed: sums.listed })}</p>
                    </div>
                  </div>
                )}
                {!scanning && (
                  <div className="rounded-xl bg-surface-2 px-3 py-2.5">
                    <p className="text-[0.82rem] font-semibold">{sources.length ? fmt(m.ready, { n: sources.length }) : m.noSources}</p>
                    <p className="mt-0.5 text-[0.72rem] text-muted">{fmt(m.readyDetail, { tn: nTn, intl: nIntl, careers: nCareers })}</p>
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: m.tallies.listed, v: sums.listed, color: "var(--ink)" },
                    { label: m.tallies.kept, v: kept, color: "var(--success)" },
                    { label: m.tallies.dropped, v: droppedTotal, color: "var(--ink-2)" },
                    { label: m.tallies.errors, v: sums.errors, color: sums.errors ? "var(--danger)" : "var(--ink-2)" },
                  ].map((x) => (
                    <div key={x.label} className="rounded-[10px] border border-line px-2.5 py-2">
                      <dt className="eyebrow text-[0.66rem]">{x.label}</dt>
                      <dd className="display tabular mt-0.5 text-[1.15rem] leading-none" style={{ color: x.color }}>{x.v}</dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <div className="bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[0.72rem] text-muted">
                    {m.lookingFor}
                    <input
                      aria-label={m.lookingFor}
                      value={kw}
                      onChange={(e) => setKw(e.target.value)}
                      disabled={busy}
                      placeholder={m.keywordsPh}
                      className="mono min-w-[12ch] flex-1 rounded-md border border-transparent bg-transparent px-1 text-ink-2 hover:border-line focus:border-line focus:outline-none"
                    />
                    ·
                    {places.countries.map((code) => {
                      const on = countries.includes(code);
                      const c = countryByCode(code);
                      return (
                        <button key={code} type="button" aria-pressed={on} disabled={busy} className={`rounded-md px-1 ${on ? "font-semibold text-ink-2" : "line-through opacity-60"}`} onClick={() => setCountries((cs) => (on ? cs.filter((x) => x !== code) : [...cs, code]))}>
                          {code === REMOTE_CODE ? t.common.remote : (c?.[L] ?? code)}
                        </button>
                      );
                    })}
                    <button type="button" className="ml-auto inline-flex items-center gap-1 font-semibold text-accent-text" aria-expanded={options} onClick={() => setOptions((o) => !o)}>
                      <Settings2 size={12} aria-hidden="true" /> {m.options}
                    </button>
                  </p>
                </div>
                {options && (
                  <div className="space-y-2 rounded-xl border border-line p-3 text-sm" style={{ animation: "pop .18s ease both" }}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="eyebrow text-[0.68rem]">{t.offers2.searchBar.typesLabel}</span>
                      {JOB_TYPES.map((ty) => {
                        const on = types.includes(ty);
                        return (
                          <button key={ty} type="button" aria-pressed={on} className={`chip min-h-7 cursor-pointer ${on ? "chip-accent" : ""}`} onClick={() => setTypes((xs) => (on ? xs.filter((x) => x !== ty) : [...xs, ty]))}>
                            {t.jobTypes[ty]}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <label className="flex items-center gap-2">
                        <span className="eyebrow text-[0.68rem]">{t.offers2.searchBar.remoteLabel}</span>
                        <select className="input !h-8 !w-auto !py-0 text-sm" value={remote} onChange={(e) => setRemote(e.target.value as Remote)}>
                          {(["yes", "only", "no"] as const).map((r) => (
                            <option key={r} value={r}>{t.offers2.searchBar.remoteOpts[r]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex min-w-48 flex-1 items-center gap-2">
                        <span className="eyebrow shrink-0 text-[0.68rem]">{t.offers2.searchBar.negatives}</span>
                        <input className="input !h-8 min-w-0 flex-1 !py-0 text-sm" value={negatives} placeholder={t.offers2.searchBar.negativesPh} onChange={(e) => setNegatives(e.target.value)} />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={includeSenior} onChange={(e) => setIncludeSenior(e.target.checked)} /> {t.offers2.searchBar.includeSenior}
                      </label>
                    </div>
                    {prefs ? <SearchPrefsForm prefs={prefs} compact onSaved={setPrefs} /> : <Loader2 size={16} className="animate-spin text-muted" aria-label={t.common.loading} />}
                  </div>
                )}
              </div>
            </div>

            <ul aria-label={t.sources2.radar.sourcesLabel} className="mt-auto flex flex-wrap gap-1.5 border-t border-line px-[18px] pb-3.5 pt-2.5">
              {blips.map((b) => {
                const state = b.st?.state;
                const cls = state === "done" ? "border-transparent bg-success-soft text-success" : state === "running" ? "border-transparent bg-accent-soft text-accent-text" : state === "error" ? "border-transparent bg-danger-soft text-danger" : "border-line bg-surface text-ink-2";
                const dot = state === "done" ? "var(--success)" : state === "running" ? "var(--accent)" : state === "error" ? "var(--danger)" : "var(--line-strong)";
                return (
                  <li key={b.key} className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border pl-1.5 pr-2 text-[0.7rem] font-semibold transition-all ${cls}`} title={state === "error" ? b.st?.error : undefined}>
                    <span className="size-1.5 rounded-full" style={{ background: dot }} />
                    {b.label}
                    {state === "done" && <span className="mono opacity-80">+{b.st?.added ?? 0}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <Feed
          jobs={jobs}
          scanning={scanning}
          done={finishedAll ? done : null}
          dropped={droppedTotal}
          errors={sums.errors}
          elapsed={elapsed}
          finished={finished}
          total={total}
          onScanAgain={run}
        />
      </div>
    </>
  );
}

// ---------- live feed ----------
type Local = { tracked?: boolean; appId?: number | null; score?: number | null; dismissed?: boolean };

function Feed({ jobs, scanning, done, dropped, errors, elapsed, finished, total, onScanAgain }: { jobs: FoundJob[]; scanning: boolean; done: ScanDone | null; dropped: number; errors: number; elapsed: number; finished: number; total: number; onScanAgain: () => void }) {
  const { t } = useT();
  const m = t.sources2.scan2;
  const toast = useToast();
  const [local, setLocal] = useState<Record<number, Local>>({});
  // One clock reading per mount: deadline chips must not change between renders.
  const [now] = useState(() => Date.now());
  const [scoringAll, setScoringAll] = useState<{ i: number; n: number } | null>(null);
  const patch = (id: number, p: Local) => setLocal((s) => ({ ...s, [id]: { ...s[id], ...p } }));
  const sorted = useMemo(() => [...jobs].sort((a, b) => Number(!!local[a.id]?.dismissed) - Number(!!local[b.id]?.dismissed) || b.relevance - a.relevance || a.id - b.id), [jobs, local]);
  const show = scanning || jobs.length > 0 || done !== null;
  const unscored = jobs.filter((j) => local[j.id]?.score == null && !local[j.id]?.dismissed);
  const strong = jobs.filter((j) => (local[j.id]?.score ?? 0) >= STRONG && !local[j.id]?.tracked);
  const nTracked = jobs.filter((j) => local[j.id]?.tracked).length;
  const nScored = jobs.filter((j) => local[j.id]?.score != null).length;

  const scoreOne = async (j: FoundJob) => {
    const r = await evaluateOffer(j.id);
    if (r.ok && r.global !== undefined) patch(j.id, { score: r.global });
    else toast.error(t.common.error);
  };
  const scoreAll = async () => {
    const items = unscored;
    setScoringAll({ i: 0, n: items.length });
    for (let i = 0; i < items.length; i++) {
      setScoringAll({ i: i + 1, n: items.length });
      await scoreOne(items[i]);
    }
    setScoringAll(null);
  };
  const trackMany = async (ids: number[]) => {
    const n = await trackOffers(ids);
    if (n) {
      for (const id of ids) patch(id, { tracked: true });
      toast.success(fmt(t.offers2.toastTracked, { n }));
    } else toast.error(t.common.error);
  };

  return (
    <section className="card flex min-h-[320px] flex-col overflow-hidden" style={{ minHeight: show ? 520 : 320 }}>
      {done && (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-line bg-bg-elev px-[18px] py-3.5" style={{ animation: "pop .35s cubic-bezier(.2,.7,.2,1) .25s both" }}>
          <span className="tile tile-sm tone-success !size-10 !rounded-xl" style={{ animation: "land .6s cubic-bezier(.2,.7,.2,1) .3s both" }}>
            <CircleCheck size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[1.15rem] tracking-[-0.01em]">{done.added === 0 ? m.titleDoneNone : done.added === 1 ? m.titleDoneOne : fmt(m.titleDone, { n: done.added })}</h2>
            <p className="mt-0.5 text-[0.8rem] text-muted">{fmt(m.summary, { listed: jobs.length + done.duplicates + dropped, dupes: done.duplicates, dropped, errors: errors || done.errors, s: elapsed })}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unscored.length > 0 && (
              <button type="button" className="btn btn-saffron !h-9" disabled={!!scoringAll} onClick={() => void scoreAll()}>
                {scoringAll ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
                {scoringAll ? fmt(m.scoreAllRunning, scoringAll) : fmt(m.scoreAll, { n: unscored.length })}
              </button>
            )}
            {strong.length > 0 && (
              <button type="button" className="btn btn-outline !h-9" onClick={() => void trackMany(strong.map((j) => j.id))}>
                <Bookmark size={14} aria-hidden="true" /> {m.trackGood}
              </button>
            )}
            <button type="button" className="btn btn-outline !h-9 text-ink-2" onClick={onScanAgain}>
              <RefreshCw size={14} aria-hidden="true" /> {m.scanAgain}
            </button>
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
        <div className="grid flex-1 place-items-center p-10 text-center text-[0.9rem] text-muted">
          <div>
            <Inbox size={28} className="mx-auto mb-2 text-line-strong" aria-hidden="true" />
            <p>{m.feedEmpty}</p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-1 flex-col gap-1.5 p-2">
          {sorted.map((j) => (
            <FeedRow key={j.id} job={j} now={now} local={local[j.id] ?? {}} patch={(p) => patch(j.id, p)} scoreOne={() => scoreOne(j)} trackOne={() => trackMany([j.id])} />
          ))}
        </ul>
      )}
      {done && (
        <div className="flex items-center gap-3 border-t border-line px-[18px] py-3 text-[0.82rem] text-muted">
          <span className="flex-1">{fmt(m.footer, { kept: jobs.length, tracked: nTracked, scored: nScored })}</span>
          <Link href="/app/jobs?sort=newest" className="whitespace-nowrap font-semibold">{m.allOffers}</Link>
          <Link href="/app/pipeline" className="whitespace-nowrap font-semibold">{m.pipeline}</Link>
        </div>
      )}
    </section>
  );
}

function FeedRow({ job: j, now, local, patch, scoreOne, trackOne }: { job: FoundJob; now: number; local: Local; patch: (p: Local) => void; scoreOne: () => Promise<void>; trackOne: () => Promise<void> }) {
  const { t, locale } = useT();
  const m = t.sources2.scan2;
  const r = t.offers2.results;
  const [pending, start] = useTransition();
  const [scoring, startScore] = useTransition();
  const score = local.score ?? null;
  const strong = score !== null && score >= STRONG;
  const weak = score !== null && score < STRONG;
  const suspicious = j.trust < 60;
  const why = j.why.slice(0, 2);
  const d = j.deadline ? Math.ceil((new Date(j.deadline).getTime() - now) / 86_400_000) : null;
  const dfg = d === null ? "" : d <= 3 ? "var(--danger)" : d <= 7 ? "var(--saffron)" : "var(--ink-2)";
  const border = local.tracked ? "var(--success)" : strong ? "color-mix(in oklab, var(--accent) 45%, var(--line))" : "var(--line)";
  const bg = local.tracked ? "color-mix(in oklab, var(--success-soft) 45%, var(--surface))" : "var(--surface)";

  return (
    <li
      className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-xl border px-3.5 py-3 sm:grid-cols-[auto_1fr_auto]"
      style={{ borderColor: border, background: bg, opacity: local.dismissed ? 0.45 : 1, animation: "slide-in .4s cubic-bezier(.2,.7,.2,1) both", transition: "opacity .3s, border-color .3s, background .3s" }}
    >
      <CompanyAvatar name={j.company} size={40} />
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2">
          <Link href={`/app/jobs/${j.id}`} className="truncate text-[0.95rem] font-semibold text-ink hover:text-accent-text">{j.title}</Link>
          {local.tracked && (
            <span className="chip chip-success !py-px text-[0.68rem]" style={{ animation: "pop .3s ease both" }}>
              <Check size={10} aria-hidden="true" /> {m.tracked}
            </span>
          )}
          {local.dismissed && <span className="chip !py-px text-[0.68rem] text-muted">{m.skipped}</span>}
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
          {d !== null && d >= 0 && (
            <>
              {" · "}
              <span className="font-semibold" style={{ color: dfg }}>{d === 0 ? r.urgentToday : fmt(r.urgent, { n: d })}</span>
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
          {score !== null && (
            <span className={`inline-flex items-center gap-1.5 rounded-full py-px pl-0.5 pr-2 text-[0.72rem] font-semibold ${strong ? "bg-accent-soft text-accent-text" : "bg-saffron-soft text-saffron"}`} style={{ animation: "pop .35s cubic-bezier(.2,.7,.2,1) both" }}>
              <ScoreRing value={score} size={20} label={scoreLabel(t, score)} animate={false} />
              {t.verdicts[score >= 4.5 ? "apply_now" : score >= 4 ? "apply" : score >= 3 ? "maybe" : "skip"]}
            </span>
          )}
        </p>
      </div>
      <div className="relative col-start-2 flex flex-wrap items-center justify-end gap-2 sm:col-start-3 sm:flex-col sm:items-end">
        <span title={m.matchTitle} className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.72rem] text-muted">
          <span className="bar !w-11 !h-[5px]">
            <span style={{ width: `${j.relevance}%` }} />
          </span>
          <span className="mono font-semibold text-ink-2">{j.relevance}%</span> {m.match}
        </span>
        {!local.dismissed && (
          <div className="flex items-center gap-1.5" style={{ animation: "fade .3s ease .4s both" }}>
            {score === null && (
              <button type="button" className="btn btn-saffron btn-sm" disabled={scoring} aria-busy={scoring} onClick={() => startScore(() => scoreOne())}>
                {scoring ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />} {scoring ? m.scoring : m.score}
              </button>
            )}
            {local.tracked ? (
              <Link href={`/app/jobs/${j.id}`} className="btn btn-primary btn-sm">
                <FileText size={13} aria-hidden="true" /> {m.openApp}
              </Link>
            ) : strong ? (
              <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(() => trackOne())} style={{ animation: "pop .3s ease both" }}>
                <Bookmark size={13} aria-hidden="true" /> {m.trackTailor}
              </button>
            ) : weak ? (
              <>
                <Link href={`/app/jobs/${j.id}?tab=fit`} className="btn btn-primary btn-sm" style={{ animation: "pop .3s ease both" }}>
                  <SearchCheck size={13} aria-hidden="true" /> {fmt(m.seeWhy, { s: score!.toFixed(1) })}
                </Link>
                <button type="button" className="btn btn-outline btn-sm text-ink-2" disabled={pending} onClick={() => start(() => trackOne())}>{m.trackAnyway}</button>
              </>
            ) : (
              <Link href={`/app/jobs/${j.id}`} className="btn btn-outline btn-sm text-ink-2">{m.details}</Link>
            )}
            <Menu label={m.more} trigger={<MoreHorizontal size={15} aria-hidden="true" />} triggerClassName="btn btn-outline btn-icon btn-sm text-ink-2">
              <MenuItem href={j.url}><ExternalLink size={14} aria-hidden="true" /> {m.openPosting}</MenuItem>
              <MenuItem href={contactSearchUrl(j.company)}><UserSearch size={14} aria-hidden="true" /> {m.contact}</MenuItem>
              <MenuItem href={`/app/companies`}><Building2 size={14} aria-hidden="true" /> {fmt(m.about, { company: j.company })}</MenuItem>
              {!local.tracked && (
                <MenuItem danger onClick={() => patch({ dismissed: true })}><Archive size={14} aria-hidden="true" /> {m.skip}</MenuItem>
              )}
            </Menu>
          </div>
        )}
      </div>
    </li>
  );
}

function whyText(t: ReturnType<typeof useT>["t"], locale: string, code: string): string {
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
    default: return code;
  }
}
