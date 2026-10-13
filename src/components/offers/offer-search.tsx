"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radar, Settings2, X } from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { countryByCode, REMOTE_CODE } from "@/lib/geo";
import { useScan } from "@/components/sources/use-scan";
import { ScanRadar } from "@/components/sources/scan-radar";
import { prepareSearchSources } from "@/app/actions/sources";

/**
 * The heart of Khedma: search offers across every source with your keywords and places.
 * Runs the scan (radar shown inline) and refreshes the list when done.
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
  const { start, running, status, total, finished } = useScan();
  const [kw, setKw] = useState(keywords.join(", "));
  const [countries, setCountries] = useState<string[]>(places.countries);
  const [srcs, setSrcs] = useState(sources);
  const [open, setOpen] = useState(autoFocus || sources.length === 0);
  const [preparing, startPrepare] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const L = locale === "fr" ? "fr" : "en";
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const run = () => {
    const terms = kw.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
    startPrepare(async () => {
      let list = srcs;
      if (list.length === 0) {
        list = await prepareSearchSources();
        setSrcs(list);
        toast.info(s.sourcesAdded);
      }
      const r = await start({ keywords: terms, countries });
      if (r.kind === "done") {
        const n = r.done.added;
        toast.success(n ? fmt(s.found, { n }) : s.foundNone, undefined, n ? { label: s.view, onClick: () => router.push("/app/jobs?sort=newest") } : undefined);
        router.refresh();
      } else if (r.kind === "busy") toast.info(t.sources2.busy);
      else if (r.kind === "error") toast.error(t.sources2.scanFailed, r.error);
    });
  };
  const busy = running || preparing;

  return (
    <section id="search" className="card relative mb-6 overflow-hidden p-4 rise sm:p-5" aria-labelledby="search-h">
      <div className="pattern pattern-fade" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="search-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
            {s.title}
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Settings2 size={14} aria-hidden="true" /> {open ? s.less : s.more}
          </button>
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
          <button type="submit" className="btn btn-primary btn-lg sm:min-w-44" disabled={busy} aria-busy={busy}>
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Radar size={18} aria-hidden="true" />}
            {busy ? s.running : s.button}
          </button>
        </form>
        {open && (
          <div className="mt-3 space-y-2 text-sm">
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
            <p className="text-xs text-muted">
              {srcs.length ? fmt(s.sourcesCount, { n: srcs.length }) : s.noSources} · <Link href="/app/sources" className="text-accent-text underline underline-offset-2">{s.manageSources}</Link>
            </p>
          </div>
        )}
        {(running || preparing) && total > 0 && (
          <div className="mt-4">
            <ScanRadar sources={srcs} status={status} keywords={kw.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean)} location={countries.join(",")} finished={finished} total={total} running={running} />
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
