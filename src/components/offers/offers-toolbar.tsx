"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { BookmarkPlus, LayoutGrid, Rows3, Search, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { JOB_TYPES } from "@/lib/types";
import { useToast } from "@/components/kit/toast";
import { Dialog } from "@/components/kit/dialog";
import { deleteOfferView, saveOfferView } from "@/app/actions/jobs";
import type { OfferFilters, SavedView } from "@/lib/repo/offers";

export type SetParams = (patch: Record<string, string | null>) => void;
const VERDICT_KEYS = ["apply_now", "apply", "maybe", "skip", "none"] as const;

const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]).join(",") || null;

/** Saved-view tabs above the list. "All offers" is the empty query. */
export function SavedViews({ views, query }: { views: SavedView[]; query: string }) {
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const tabs = [{ id: "", name: t.offers2.views.all, query: "" }, ...views];

  return (
    <div className="mb-4 flex items-end gap-2 border-b border-line no-print">
      <nav aria-label={t.offers2.views.label} className="min-w-0 flex-1">
        <ul className="flex gap-1 overflow-x-auto overflow-y-hidden">
          {tabs.map((v) => {
            const current = v.query === query;
            return (
              <li key={v.id || "all"} className="group relative flex shrink-0 items-center">
                <Link
                  href={v.query ? `/app/jobs?${v.query}` : "/app/jobs"}
                  aria-current={current ? "page" : undefined}
                  className={`-mb-px block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                    current ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
                  } ${v.id ? "pr-8" : ""}`}
                >
                  {v.name}
                </Link>
                {v.id && (
                  <button
                    type="button"
                    className="absolute right-1 grid size-6 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                    aria-label={fmt(t.offers2.views.remove, { name: v.name })}
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await deleteOfferView(v.id);
                        toast.success(t.offers2.views.removed);
                      })
                    }
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <button
        type="button"
        className="btn btn-ghost btn-sm mb-1 shrink-0"
        aria-label={t.offers2.views.save}
        onClick={() => (query ? setOpen(true) : toast.info(t.offers2.views.nothingToSave))}
      >
        <BookmarkPlus size={15} aria-hidden="true" /> <span className="hidden sm:inline">{t.offers2.views.save}</span>
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
    </div>
  );
}

export function OffersToolbar({
  filters: f,
  setParams,
  sources,
  view,
  setView,
}: {
  filters: OfferFilters;
  setParams: SetParams;
  sources: string[];
  view: "table" | "cards";
  setView: (v: "table" | "cards") => void;
}) {
  const { t } = useT();
  const o = t.offers2;
  // Local search text, re-synced when the URL changes from elsewhere (saved view, clear).
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

  const active =
    !!f.q || f.types.length > 0 || f.verdicts.length > 0 || f.min > 0 || f.remote || f.deadline || f.starred || !!f.tracked || !!f.source || f.dup || f.archived;
  const chip = (on: boolean) => `chip min-h-7 cursor-pointer select-none transition-colors ${on ? "chip-accent" : "hover:border-line-strong"}`;
  const flag = (key: string, on: boolean, label: string) => (
    <button type="button" aria-pressed={on} className={chip(on)} onClick={() => setParams({ [key]: on ? null : "1" })}>
      {label}
    </button>
  );

  return (
    <div className="card mb-4 p-3 sm:p-4 no-print" role="search" aria-label={o.filters}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <label htmlFor="offers-q" className="sr-only">{o.search}</label>
          <input id="offers-q" type="search" className="input !pl-9" placeholder={o.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label htmlFor="offers-sort" className="sr-only">{o.sort}</label>
        <select id="offers-sort" className="input !w-auto" value={f.sort} onChange={(e) => setParams({ sort: e.target.value === "newest" ? null : e.target.value })}>
          {(["newest", "score", "deadline", "company"] as const).map((s) => (
            <option key={s} value={s}>{o.sort} : {o.sorts[s]}</option>
          ))}
        </select>
        <div role="group" aria-label={o.view} className="inline-flex rounded-[10px] border border-line-strong p-0.5">
          {(["table", "cards"] as const).map((v) => {
            const Icon = v === "table" ? Rows3 : LayoutGrid;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                className={`btn btn-sm btn-icon !min-h-8 !w-9 ${view === v ? "bg-surface-3 text-ink" : "btn-ghost"}`}
                onClick={() => setView(v)}
              >
                <Icon size={16} aria-hidden="true" />
                <span className="sr-only">{o[v]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2.5 text-sm">
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">{o.type}</legend>
          {JOB_TYPES.map((ty) => (
            <button key={ty} type="button" aria-pressed={f.types.includes(ty)} className={chip(f.types.includes(ty))} onClick={() => setParams({ type: toggleIn(f.types, ty) })}>
              {t.jobTypes[ty]}
            </button>
          ))}
        </fieldset>
        <span aria-hidden="true" className="hidden h-5 w-px bg-line sm:block" />
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">{o.verdict}</legend>
          {VERDICT_KEYS.map((v) => (
            <button key={v} type="button" aria-pressed={f.verdicts.includes(v)} className={chip(f.verdicts.includes(v))} onClick={() => setParams({ verdict: toggleIn(f.verdicts, v) })}>
              {v === "none" ? o.notEvaluated : t.verdicts[v]}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2.5 text-sm">
        <div className="flex items-center gap-2">
          <label htmlFor="offers-min" className="text-muted whitespace-nowrap">{o.minScore}</label>
          <input
            id="offers-min"
            type="range"
            min={0}
            max={5}
            step={0.5}
            value={min}
            className="w-28 accent-[var(--accent)]"
            aria-valuetext={min ? `≥ ${min.toFixed(1)}` : o.any}
            onChange={(e) => setMin(Number(e.target.value))}
            onPointerUp={() => setParams({ min: min ? String(min) : null })}
            onKeyUp={() => setParams({ min: min ? String(min) : null })}
          />
          <output htmlFor="offers-min" className="mono w-10 text-xs">{min ? `≥${min.toFixed(1)}` : o.any}</output>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {flag("remote", f.remote, o.remoteOnly)}
          {flag("deadline", f.deadline, o.hasDeadline)}
          {flag("starred", f.starred, o.starred)}
          {flag("dup", f.dup, o.duplicates)}
          {flag("archived", f.archived, o.archived)}
        </div>
        <label htmlFor="offers-tracked" className="sr-only">{o.trackedFilter}</label>
        <select id="offers-tracked" className="input !min-h-8 !w-auto !py-0 text-sm" value={f.tracked} onChange={(e) => setParams({ tracked: e.target.value || null })}>
          <option value="">{o.trackedFilter} : {o.any}</option>
          <option value="yes">{o.tracked}</option>
          <option value="no">{o.untracked}</option>
        </select>
        {sources.length > 1 && (
          <>
            <label htmlFor="offers-source" className="sr-only">{o.source}</label>
            <select id="offers-source" className="input !min-h-8 !w-auto !py-0 text-sm" value={f.source} onChange={(e) => setParams({ source: e.target.value || null })}>
              <option value="">{o.allSources}</option>
              {sources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </>
        )}
        {active && (
          <Link href="/app/jobs" className="btn btn-ghost btn-sm ml-auto" onClick={() => setQ("")}>
            <X size={14} aria-hidden="true" /> {o.clear}
          </Link>
        )}
      </div>
    </div>
  );
}
