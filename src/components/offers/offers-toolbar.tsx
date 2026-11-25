"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { BookmarkPlus, Download, LayoutGrid, MapPin, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt, sourceName } from "@/lib/i18n/dict";
import { JOB_TYPES } from "@/lib/types";
import { REGIONS, REMOTE_CODE, countryByCode, type RegionKey } from "@/lib/geo";
import { POSTED_DAYS, type Facets } from "@/lib/offers-filter";
import { useToast } from "@/components/kit/toast";
import { Dialog } from "@/components/kit/dialog";
import { deleteOfferView, saveOfferView } from "@/app/actions/jobs";
import type { OfferFilters, SavedView } from "@/lib/repo/offers";

export type SetParams = (patch: Record<string, string | null>) => void;
const VERDICT_KEYS = ["apply_now", "apply", "maybe", "skip", "none"] as const;
/** Every filter in the URL. "Clear all" keeps the sort order and the "show expired" switch. */
export const CLEAR_FILTERS: Record<string, null> = Object.fromEntries(["q", "not", "type", "verdict", "min", "remote", "country", "region", "posted", "deadline", "starred", "tracked", "source", "dup", "archived"].map((k) => [k, null]));
/** Country pills shown before the "+N more" fold. */
const COUNTRY_FOLD = 6;

const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]).join(",") || null;

/** Pill button used inside the filter panel. */
const pill = (on: boolean) =>
  `inline-flex h-7 cursor-pointer select-none items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[0.78rem] font-semibold transition-colors ${
    on ? "border-transparent bg-accent-soft text-accent-text" : "border-line bg-surface text-ink-2 hover:border-line-strong"
  }`;

/** Saved views as a segmented control. "All offers" is the empty query. */
export function SavedViews({ views, query }: { views: SavedView[]; query: string }) {
  const { t } = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  const tabs = [{ id: "", name: t.offers2.views.all, query: "" }, ...views];
  return (
    // Links to other filter sets, not tabs: no tabpanel and no arrow-key roving to promise.
    <nav aria-label={t.offers2.views.label} className="seg max-w-full overflow-x-auto no-print">
      {tabs.map((v) => {
        const current = v.query === query;
        return (
          <span key={v.id || "all"} className="group relative inline-flex items-center">
            <Link href={v.query ? `/app/jobs?${v.query}` : "/app/jobs"} aria-current={current ? "page" : undefined} className={`seg-btn ${v.id ? "!pr-7" : ""}`}>
              {v.name}
            </Link>
            {v.id && (
              <button
                type="button"
                className="absolute right-1 grid size-5 place-items-center rounded-md text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={fmt(t.offers2.views.remove, { name: v.name })}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await deleteOfferView(v.id);
                    toast.success(t.offers2.views.removed);
                  })
                }
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function SaveViewButton({ query }: { query: string }) {
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className={pill(false)} onClick={() => (query ? setOpen(true) : toast.info(t.offers2.views.nothingToSave))}>
        <BookmarkPlus size={12} aria-hidden="true" /> {t.offers2.list2.saveView}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t.offers2.views.save}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>{t.common.cancel}</button>
            <button type="submit" form="save-view" className="btn btn-primary" disabled={pending || !name.trim()} aria-busy={pending}>
              {t.common.save}
            </button>
          </>
        }
      >
        <form
          id="save-view"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const v = await saveOfferView(name, query);
              if (v) {
                toast.success(t.offers2.views.saved, v.name);
                setOpen(false);
                setName("");
              }
            });
          }}
        >
          <label className="label" htmlFor="view-name">{t.offers2.views.name}</label>
          <input id="view-name" ref={(el) => el?.setAttribute("autofocus", "")} className="input" maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} placeholder={t.offers2.views.namePh} />
        </form>
      </Dialog>
    </>
  );
}

export function countActive(f: OfferFilters) {
  return [f.q, f.not.length, f.types.length, f.verdicts.length, f.min > 0, f.remote, f.deadline, f.starred, f.tracked, f.source, f.dup, f.archived, f.countries.length || f.regions.length, f.posted].filter(Boolean).length;
}

/** One row of controls: search, saved views, sort, layout, a Filters button with a count; active filters as chips; the panel opens below. */
export function OffersToolbar({
  filters: f,
  setParams,
  sources,
  countries,
  myCountries,
  facets,
  view,
  setView,
  views,
  query,
}: {
  filters: OfferFilters;
  setParams: SetParams;
  sources: string[];
  /** Country codes found in the offers, most offers first. */
  countries: string[];
  myCountries: string[];
  facets: Facets;
  view: "table" | "cards";
  setView: (v: "table" | "cards") => void;
  views: SavedView[];
  query: string;
}) {
  const { t, locale } = useT();
  const o = t.offers2;
  const L = o.list2;
  const mineOn = myCountries.length > 0 && f.countries.length === myCountries.length && myCountries.every((c) => f.countries.includes(c));
  const [q, setQ] = useState(f.q);
  const [seenQ, setSeenQ] = useState(f.q);
  if (f.q !== seenQ) {
    setSeenQ(f.q);
    // Only when the filter changed from outside (a chip, a saved view): echoing our own value back would eat a trailing space mid-typing.
    if (f.q !== q.trim()) setQ(f.q);
  }
  useEffect(() => {
    if (q.trim() === f.q) return;
    const id = setTimeout(() => setParams({ q: q.trim() || null }), 300);
    return () => clearTimeout(id);
  }, [q, f.q, setParams]);
  const [min, setMin] = useState(f.min);
  const [seenMin, setSeenMin] = useState(f.min);
  if (f.min !== seenMin) {
    setSeenMin(f.min);
    setMin(f.min);
  }
  const [not, setNot] = useState("");
  const [allCountries, setAllCountries] = useState(false);
  const active = countActive(f) - (f.q ? 1 : 0);
  // Closed by default: the chips below already say what is filtered, and an open panel hides the list on a phone.
  const [open, setOpen] = useState(false);

  const countryLabel = (code: string) => (code === REMOTE_CODE ? t.common.remote : (countryByCode(code)?.[locale === "fr" ? "fr" : "en"] ?? code));
  const regions = REGIONS.filter((r) => r.codes.length > 1 && r.codes.some((c) => countries.includes(c)));
  const regionLabel = (key: RegionKey) => t.sources2.scan2.regions[key];
  const shownCountries = allCountries || countries.length <= COUNTRY_FOLD + 2 ? countries : countries.filter((c, i) => i < COUNTRY_FOLD || f.countries.includes(c));

  /** A filter option with the number of offers it would list. */
  const opt = (key: string, on: boolean, label: React.ReactNode, n: number | undefined, patch: Record<string, string | null>) => (
    <button key={key} type="button" aria-pressed={on} className={`${pill(on)} ${!on && n === 0 ? "opacity-50" : ""}`} onClick={() => setParams(patch)}>
      {label} {n !== undefined && <span className="tabular font-normal opacity-60">{n}</span>}
    </button>
  );
  const flag = (key: "remote" | "deadline" | "starred" | "dup", on: boolean, label: string) => opt(key, on, label, facets.flag[key] ?? 0, { [key]: on ? null : "1" });
  const group = (label: string, children: React.ReactNode) => (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden="true" className="eyebrow mr-1 text-[0.72rem]">{label}</span>
      {children}
    </div>
  );

  const chip = (key: string, label: string, off: Record<string, string | null>) => ({ key, label, off });
  const chips = [
    ...(f.q ? [chip("q", fmt(L.chipSearch, { q: f.q }), { q: null })] : []),
    ...f.not.map((w) => chip(`not-${w}`, fmt(L.chipNot, { w }), { not: toggleIn(f.not, w) })),
    ...f.types.map((ty) => chip(ty, t.jobTypes[ty], { type: toggleIn(f.types, ty) })),
    ...(f.posted ? [chip("posted", fmt(L.chipPosted, { v: L.postedOpts[f.posted] }), { posted: null })] : []),
    ...f.regions.map((r) => chip(r, regionLabel(r), { region: toggleIn(f.regions, r) })),
    ...f.countries.map((c) => chip(c, countryLabel(c), { country: toggleIn(f.countries, c) })),
    ...f.verdicts.map((v) => chip(v, v === "none" ? o.notEvaluated : t.verdicts[v], { verdict: toggleIn(f.verdicts, v) })),
    ...(f.min ? [chip("min", fmt(L.chipMin, { n: f.min.toFixed(1) }), { min: null })] : []),
    ...(f.remote ? [chip("remote", o.remoteOnly, { remote: null })] : []),
    ...(f.deadline ? [chip("deadline", o.hasDeadline, { deadline: null })] : []),
    ...(f.starred ? [chip("starred", o.starred, { starred: null })] : []),
    ...(f.dup ? [chip("dup", o.duplicates, { dup: null })] : []),
    ...(f.tracked ? [chip("tracked", f.tracked === "yes" ? o.tracked : o.untracked, { tracked: null })] : []),
    ...(f.source ? [chip("source", fmt(L.chipSource, { s: sourceName(t, f.source) }), { source: null })] : []),
    ...(f.archived ? [chip("archived", o.archived, { archived: null })] : []),
  ];

  return (
    <div className="no-print" role="search" aria-label={o.filters}>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-[380px]">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <label htmlFor="offers-q" className="sr-only">{o.search}</label>
          <input id="offers-q" type="search" className="input !h-[38px] !border-line !py-0 !pl-9 text-sm" placeholder={o.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <SavedViews views={views} query={query} />
        {/* The order is always visible: "best score" by default, so the list reads best-first. */}
        <label className="flex items-center gap-1.5 text-[0.8rem] text-muted">
          <span>{L.sort}</span>
          <select className="input !h-[38px] !w-auto !border-line !py-0 text-sm" value={f.sort} onChange={(e) => setParams({ sort: e.target.value === "score" ? null : e.target.value })}>
            {(["score", "newest", "deadline", "company"] as const).map((s) => (
              <option key={s} value={s}>{o.sorts[s]}</option>
            ))}
          </select>
        </label>
        <span role="group" aria-label={o.view} className="seg">
          {(["table", "cards"] as const).map((v) => {
            const Icon = v === "table" ? Rows3 : LayoutGrid;
            return (
              <button key={v} type="button" aria-pressed={view === v} title={o[v]} className={`seg-btn !px-2.5 ${view === v ? "on" : ""}`} onClick={() => setView(v)}>
                <Icon size={15} aria-hidden="true" />
                <span className="sr-only">{o[v]}</span>
              </button>
            );
          })}
        </span>
        {/* Last in the row, so the panel it opens is the next Tab stop. */}
        <button type="button" className="btn btn-outline !h-[38px] !px-3" aria-expanded={open} aria-controls="offers-filters" onClick={() => setOpen((v) => !v)}>
          <SlidersHorizontal size={15} aria-hidden="true" /> {L.filters}
          {active > 0 && <span className="mono inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[0.68rem] text-accent-ink">{active}</span>}
        </button>
        <span className="ml-auto hidden text-[0.78rem] text-muted xl:inline">{L.keys}</span>
      </div>

      {open && (
        <div
          id="offers-filters"
          className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm max-sm:max-h-[60vh] max-sm:overflow-y-auto"
          style={{ animation: "pop .18s ease both" }}
        >
          {group(o.type, JOB_TYPES.map((ty) => opt(ty, f.types.includes(ty), t.jobTypes[ty], facets.type[ty] ?? 0, { type: toggleIn(f.types, ty) })))}
          {group(
            o.posted,
            <>
              {opt("any", !f.posted, o.any, undefined, { posted: null })}
              {POSTED_DAYS.map((d) => opt(String(d), f.posted === d, L.postedOpts[d], facets.posted[d] ?? 0, { posted: f.posted === d ? null : String(d) }))}
            </>,
          )}
          {regions.length > 0 && group(L.region, regions.map((r) => opt(r.key, f.regions.includes(r.key), regionLabel(r.key), facets.region[r.key] ?? 0, { region: toggleIn(f.regions, r.key) })))}
          {countries.length > 0 &&
            group(
              o.country,
              <>
                {myCountries.length > 0 && (
                  <button type="button" aria-pressed={mineOn} className={pill(mineOn)} onClick={() => setParams({ country: mineOn ? null : myCountries.join(",") })}>
                    <MapPin size={12} aria-hidden="true" /> {o.myCountries}
                  </button>
                )}
                {shownCountries.map((code) =>
                  opt(
                    code,
                    f.countries.includes(code),
                    <>
                      <span aria-hidden="true">{code === REMOTE_CODE ? "🌐" : countryByCode(code)?.flag}</span> {countryLabel(code)}
                    </>,
                    facets.country[code] ?? 0,
                    { country: toggleIn(f.countries, code) },
                  ),
                )}
                {countries.length > COUNTRY_FOLD + 2 && (
                  <button type="button" className={`${pill(false)} !border-dashed`} aria-expanded={allCountries} onClick={() => setAllCountries((v) => !v)}>
                    {allCountries ? t.sources2.scan2.fewerCountries : fmt(t.sources2.scan2.moreCountries, { n: countries.length - shownCountries.length })}
                  </button>
                )}
              </>,
            )}
          {group(o.verdict, VERDICT_KEYS.map((v) => opt(v, f.verdicts.includes(v), v === "none" ? o.notEvaluated : t.verdicts[v], facets.verdict[v] ?? 0, { verdict: toggleIn(f.verdicts, v) })))}
          {group(
            L.flags,
            <>
              {flag("remote", f.remote, o.remoteOnly)}
              {flag("deadline", f.deadline, o.hasDeadline)}
              {flag("starred", f.starred, o.starred)}
              {flag("dup", f.dup, o.duplicates)}
              {opt("archived", f.archived, o.archived, undefined, { archived: f.archived ? null : "1" })}
            </>,
          )}
          {group(
            L.tracking,
            <>
              {opt("any", !f.tracked, o.any, undefined, { tracked: null })}
              {opt("yes", f.tracked === "yes", o.tracked, facets.tracked.yes ?? 0, { tracked: "yes" })}
              {opt("no", f.tracked === "no", o.untracked, facets.tracked.no ?? 0, { tracked: "no" })}
            </>,
          )}
          {group(
            L.minScore,
            <>
              <input
                id="offers-min"
                type="range"
                min={0}
                max={5}
                step={0.5}
                value={min}
                className="w-24 accent-[var(--accent)]"
                aria-label={o.minScore}
                aria-valuetext={min ? `≥ ${min.toFixed(1)}` : o.any}
                onChange={(e) => setMin(Number(e.target.value))}
                onPointerUp={() => setParams({ min: min ? String(min) : null })}
                onKeyUp={() => setParams({ min: min ? String(min) : null })}
              />
              <output htmlFor="offers-min" className="mono w-10 text-xs">{min ? `≥${min.toFixed(1)}` : o.any}</output>
            </>,
          )}
          {sources.length > 1 &&
            group(
              o.source,
              <select className="input !h-7 !w-auto !py-0 text-[0.78rem]" aria-label={o.source} value={f.source} onChange={(e) => setParams({ source: e.target.value || null })}>
                <option value="">{o.allSources}</option>
                {sources.map((s) => (
                  <option key={s} value={s}>{sourceName(t, s)} ({facets.source[s] ?? 0})</option>
                ))}
              </select>,
            )}
          <form
            role="group"
            aria-label={L.exclude}
            className="flex flex-wrap items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!not.trim()) return;
              // The URL parser trims, lowercases and dedupes; the words then show as chips under the toolbar.
              setParams({ not: [...f.not, not].join(",") });
              setNot("");
            }}
          >
            <label htmlFor="offers-not" className="eyebrow mr-1 text-[0.72rem]">{L.exclude}</label>
            <input id="offers-not" className="input !h-7 !w-36 !py-0 text-[0.78rem]" maxLength={60} placeholder={L.excludePh} value={not} onChange={(e) => setNot(e.target.value)} />
            <button type="submit" className={pill(false)} disabled={!not.trim()}>{L.excludeAdd}</button>
          </form>
          <SaveViewButton query={query} />
          <a href={`/api/offers/export${query ? `?${query}` : ""}`} className={pill(false)} download>
            <Download size={12} aria-hidden="true" /> {L.export}
          </a>
        </div>
      )}

      {chips.length > 0 && (
        <ul aria-label={L.active} className="mb-3 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <li key={c.key} className="min-w-0">
              <button type="button" className="chip chip-accent max-w-[16rem] cursor-pointer hover:underline" aria-label={fmt(L.removeFilter, { name: c.label })} onClick={() => setParams(c.off)}>
                <span className="min-w-0 truncate">{c.label}</span> <X size={12} aria-hidden="true" className="shrink-0" />
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="ml-1 text-[0.8rem] font-semibold text-accent-text hover:underline" onClick={() => setParams(CLEAR_FILTERS)}>
              {L.clearAll}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
