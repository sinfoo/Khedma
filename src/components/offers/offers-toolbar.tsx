"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { BookmarkPlus, Download, LayoutGrid, MapPin, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { JOB_TYPES } from "@/lib/types";
import { REMOTE_CODE, countryByCode } from "@/lib/geo";
import { useToast } from "@/components/kit/toast";
import { Dialog } from "@/components/kit/dialog";
import { deleteOfferView, saveOfferView } from "@/app/actions/jobs";
import type { OfferFilters, SavedView } from "@/lib/repo/offers";

export type SetParams = (patch: Record<string, string | null>) => void;
const VERDICT_KEYS = ["apply_now", "apply", "maybe", "skip", "none"] as const;

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
    <div role="tablist" aria-label={t.offers2.views.label} className="seg max-w-full overflow-x-auto no-print">
      {tabs.map((v) => {
        const current = v.query === query;
        return (
          <span key={v.id || "all"} className="group relative inline-flex items-center">
            <Link href={v.query ? `/app/jobs?${v.query}` : "/app/jobs"} role="tab" aria-selected={current} className={`seg-btn ${v.id ? "!pr-7" : ""}`}>
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
    </div>
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
  return [f.q, f.types.length, f.verdicts.length, f.min > 0, f.remote, f.deadline, f.starred, f.tracked, f.source, f.dup, f.archived, f.countries.length].filter(Boolean).length;
}

/** One row of controls: search, saved views, a Filters button with a count, layout; the panel opens below. */
export function OffersToolbar({
  filters: f,
  setParams,
  sources,
  countries,
  myCountries,
  view,
  setView,
  views,
  query,
}: {
  filters: OfferFilters;
  setParams: SetParams;
  sources: string[];
  countries: string[];
  myCountries: string[];
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
    setQ(f.q);
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
  const active = countActive(f) - (f.q ? 1 : 0);
  const [open, setOpen] = useState(active > 0);
  const flag = (key: string, on: boolean, label: string) => (
    <button type="button" aria-pressed={on} className={pill(on)} onClick={() => setParams({ [key]: on ? null : "1" })}>
      {label}
    </button>
  );
  const group = (label: string, children: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="eyebrow mr-1 text-[0.72rem]">{label}</span>
      {children}
    </div>
  );

  return (
    <div className="no-print" role="search" aria-label={o.filters}>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-[380px]">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <label htmlFor="offers-q" className="sr-only">{o.search}</label>
          <input id="offers-q" type="search" className="input !h-[38px] !border-line !py-0 !pl-9 text-sm" placeholder={o.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <SavedViews views={views} query={query} />
        <button type="button" className="btn btn-outline !h-[38px] !px-3" aria-expanded={open} aria-controls="offers-filters" onClick={() => setOpen((v) => !v)}>
          <SlidersHorizontal size={15} aria-hidden="true" /> {L.filters}
          {active > 0 && <span className="mono inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[0.68rem] text-accent-ink">{active}</span>}
        </button>
        <span className="ml-auto hidden text-[0.78rem] text-muted xl:inline">{L.keys}</span>
      </div>

      {open && (
        <div id="offers-filters" className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm" style={{ animation: "pop .18s ease both" }}>
          {group(o.type, JOB_TYPES.map((ty) => (
            <button key={ty} type="button" aria-pressed={f.types.includes(ty)} className={pill(f.types.includes(ty))} onClick={() => setParams({ type: toggleIn(f.types, ty) })}>
              {t.jobTypes[ty]}
            </button>
          )))}
          {countries.length > 0 &&
            group(
              o.country,
              <>
                {myCountries.length > 0 && (
                  <button type="button" aria-pressed={mineOn} className={pill(mineOn)} onClick={() => setParams({ country: mineOn ? null : myCountries.join(",") })}>
                    <MapPin size={12} aria-hidden="true" /> {o.myCountries}
                  </button>
                )}
                {countries.map((code) => {
                  const c = countryByCode(code);
                  const label = code === REMOTE_CODE ? t.common.remote : (c?.[locale === "fr" ? "fr" : "en"] ?? code);
                  return (
                    <button key={code} type="button" aria-pressed={f.countries.includes(code)} className={pill(f.countries.includes(code))} onClick={() => setParams({ country: toggleIn(f.countries, code) })}>
                      <span aria-hidden="true">{code === REMOTE_CODE ? "🌐" : c?.flag}</span> {label}
                    </button>
                  );
                })}
              </>,
            )}
          {group(o.verdict, VERDICT_KEYS.map((v) => (
            <button key={v} type="button" aria-pressed={f.verdicts.includes(v)} className={pill(f.verdicts.includes(v))} onClick={() => setParams({ verdict: toggleIn(f.verdicts, v) })}>
              {v === "none" ? o.notEvaluated : t.verdicts[v]}
            </button>
          )))}
          {group(
            L.flags,
            <>
              {flag("remote", f.remote, o.remoteOnly)}
              {flag("deadline", f.deadline, o.hasDeadline)}
              {flag("starred", f.starred, o.starred)}
              {flag("dup", f.dup, o.duplicates)}
              {flag("archived", f.archived, o.archived)}
            </>,
          )}
          {group(
            L.tracking,
            (["", "yes", "no"] as const).map((v) => (
              <button key={v || "any"} type="button" aria-pressed={f.tracked === v} className={pill(f.tracked === v)} onClick={() => setParams({ tracked: v || null })}>
                {v === "" ? o.any : v === "yes" ? o.tracked : o.untracked}
              </button>
            )),
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
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>,
            )}
          {group(
            L.sort,
            <select className="input !h-7 !w-auto !py-0 text-[0.78rem]" aria-label={o.sort} value={f.sort} onChange={(e) => setParams({ sort: e.target.value === "newest" ? null : e.target.value })}>
              {(["newest", "score", "deadline", "company"] as const).map((s) => (
                <option key={s} value={s}>{o.sorts[s]}</option>
              ))}
            </select>,
          )}
          {group(
            L.layout,
            <span role="group" aria-label={o.view} className="seg seg-sm">
              {(["table", "cards"] as const).map((v) => {
                const Icon = v === "table" ? Rows3 : LayoutGrid;
                return (
                  <button key={v} type="button" aria-pressed={view === v} className={`seg-btn ${view === v ? "on" : ""}`} onClick={() => setView(v)}>
                    <Icon size={14} aria-hidden="true" />
                    <span className="sr-only">{o[v]}</span>
                  </button>
                );
              })}
            </span>,
          )}
          <SaveViewButton query={query} />
          <a href={`/api/offers/export${query ? `?${query}` : ""}`} className={pill(false)} download>
            <Download size={12} aria-hidden="true" /> {L.export}
          </a>
          {active > 0 && (
            <Link href="/app/jobs" className="ml-auto text-[0.8rem] font-semibold" onClick={() => setQ("")}>
              {L.clearAll}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
