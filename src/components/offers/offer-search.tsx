"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radar, Settings2, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { countryByCode, REMOTE_CODE } from "@/lib/geo";
import { JOB_TYPES, type JobType } from "@/lib/types";
import { planSearch, type Remote } from "@/lib/search/plan";
import { DEFAULT_PREFS, type SearchPrefs } from "@/lib/search/prefs";
import { useScan } from "@/components/sources/use-scan";
import { ScanRadar } from "@/components/sources/scan-radar";
import { SearchPrefsForm } from "@/components/sources/search-prefs";
import { loadSearchPrefs } from "@/app/actions/sources";
import { SearchResults } from "./search-results";

/**
 * The heart of Khedma: search offers across the boards of the chosen countries with your keywords.
 * Runs the scan (radar + live results inline) and refreshes the list when done.
 */
export function OfferSearch({
  keywords,
  places,
  sources,
  autoFocus,
}: {
  keywords: string[];
  places: { countries: string[]; remote: "yes" | "only" | "no" };
  sources: { id: number; label: string; kind: string }[];
  autoFocus: boolean;
}) {
  const { t, locale } = useT();
  const s = t.offers2.searchBar;
  const toast = useToast();
  const router = useRouter();
  const { start, running, status, total, finished, plan, jobs, dropped } = useScan();
  const [kw, setKw] = useState(keywords.join(", "));
  const [countries, setCountries] = useState<string[]>(places.countries);
  const [remote, setRemote] = useState<Remote>(places.remote);
  const [types, setTypes] = useState<JobType[]>([]);
  const [negatives, setNegatives] = useState("");
  const [includeSenior, setIncludeSenior] = useState(false);
  const [open, setOpen] = useState(autoFocus);
  const [filters, setFilters] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<SearchPrefs | null>(null);
  const [preparing, startPrepare] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const L = locale === "fr" ? "fr" : "en";
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    if (prefsOpen && !prefs) loadSearchPrefs().then(setPrefs).catch(() => setPrefs(DEFAULT_PREFS));
  }, [prefsOpen, prefs]);

  const terms = kw.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
  // Same planner as the server (minus API-key checks): tells the user what a search will query before it runs.
  const preview = planSearch({ keywords: terms, countries, remote, enabledSources: sources });

  const run = () => {
    startPrepare(async () => {
      const r = await start({ keywords: terms, countries, remote, types, negatives: negatives.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean), includeSenior });
      if (r.kind === "done") {
        const n = r.done.added;
        toast.success(n ? fmt(s.found, { n }) : s.foundNone, undefined, n ? { label: s.view, onClick: () => router.push("/app/jobs?sort=newest") } : undefined);
        router.refresh();
      } else if (r.kind === "busy") toast.info(t.sources2.busy);
      else if (r.kind === "error") toast.error(t.sources2.scanFailed, r.error);
    });
  };
  const busy = running || preparing;
  const showPanel = plan !== null && (running || preparing || jobs.length > 0 || finished > 0);

  return (
    <section id="search" className="card relative mb-6 overflow-hidden p-4 rise sm:p-5" aria-labelledby="search-h">
      <div className="pattern pattern-fade" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="search-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
            {s.title}
          </h2>
          <div className="flex items-center gap-1">
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={filters} aria-controls="search-filters" onClick={() => setFilters((o) => !o)}>
              <SlidersHorizontal size={14} aria-hidden="true" /> {s.filters}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-controls="search-where" onClick={() => setOpen((o) => !o)}>
              <Settings2 size={14} aria-hidden="true" /> {open ? s.less : s.more}
            </button>
          </div>
        </div>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) run();
          }}
        >
          <label className="sr-only" htmlFor="search-kw">{s.placeholder}</label>
          <input id="search-kw" ref={inputRef} value={kw} onChange={(e) => setKw(e.target.value)} className="input flex-1 !py-2.5 text-base" placeholder={s.placeholder} />
          <button type="submit" className="btn btn-primary btn-lg sm:min-w-44" disabled={busy || preview.runs.length === 0} aria-busy={busy}>
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Radar size={18} aria-hidden="true" />}
            {busy ? s.running : s.button}
          </button>
        </form>
        {open && (
          <div id="search-where" className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted">{s.where}</span>
              {places.countries.map((code) => {
                const on = countries.includes(code);
                const c = countryByCode(code);
                return (
                  <button key={code} type="button" aria-pressed={on} className={`chip min-h-7 cursor-pointer ${on ? "chip-accent" : ""}`} onClick={() => setCountries((cs) => (on ? cs.filter((x) => x !== code) : [...cs, code]))}>
                    <span aria-hidden="true">{code === REMOTE_CODE ? "🌐" : c?.flag}</span> {code === REMOTE_CODE ? t.common.remote : (c?.[L] ?? code)}
                  </button>
                );
              })}
              <Link href="/app/profile#sec-targets" className="chip min-h-7 hover:border-line-strong">
                + {s.editPlaces}
              </Link>
            </div>
            <p className="text-xs text-muted" aria-live="polite">
              {preview.runs.length ? fmt(s.planned, { n: preview.runs.length }) : s.plannedNone}
              {preview.runs.length > 0 && <span title={preview.runs.map((r) => r.label).join(", ")}> ({preview.runs.slice(0, 5).map((r) => r.label).join(", ")}{preview.runs.length > 5 ? "…" : ""})</span>}
              {" · "}
              <Link href="/app/sources" className="text-accent-text underline underline-offset-2">{s.manageSources}</Link>
            </p>
          </div>
        )}
        {filters && (
          <div id="search-filters" className="mt-3 space-y-2 rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted">{s.typesLabel}</span>
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
                <span className="text-xs font-semibold text-muted">{s.remoteLabel}</span>
                <select className="input !w-auto !py-1.5" value={remote} onChange={(e) => setRemote(e.target.value as Remote)}>
                  {(["yes", "only", "no"] as const).map((r) => (
                    <option key={r} value={r}>
                      {s.remoteOpts[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-64 flex-1 items-center gap-2">
                <span className="shrink-0 text-xs font-semibold text-muted">{s.negatives}</span>
                <input className="input min-w-0 flex-1 !py-1.5" value={negatives} placeholder={s.negativesPh} onChange={(e) => setNegatives(e.target.value)} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4" checked={includeSenior} onChange={(e) => setIncludeSenior(e.target.checked)} /> {s.includeSenior}
              </label>
            </div>
            <details open={prefsOpen} onToggle={(e) => setPrefsOpen((e.target as HTMLDetailsElement).open)}>
              <summary className="cursor-pointer text-xs font-semibold text-accent-text">{s.prefsToggle}</summary>
              <div className="mt-2">{prefs ? <SearchPrefsForm prefs={prefs} compact onSaved={setPrefs} /> : <Loader2 size={16} className="animate-spin text-muted" aria-label={t.common.loading} />}</div>
            </details>
          </div>
        )}
        {showPanel && plan && (
          <div className="mt-4">
            <ScanRadar
              sources={plan.runs.map((r) => ({ key: r.key, id: r.sourceId, label: r.label, kind: r.kind }))}
              status={status}
              keywords={terms}
              location={countries.join(",")}
              finished={finished}
              total={total}
              running={running}
              skipped={plan.skipped}
              skippedBlacklist={plan.skippedBlacklist}
              dropped={dropped}
            />
            <SearchResults jobs={jobs} running={running} />
          </div>
        )}
        {!running && !preparing && total > 0 && finished === total && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted" role="status">
            {s.lastRun} <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.refresh()}><X size={12} aria-hidden="true" /> {s.dismiss}</button>
          </p>
        )}
      </div>
    </section>
  );
}
