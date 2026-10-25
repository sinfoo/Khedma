"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, Archive, ArchiveRestore, Copy, ExternalLink, FileText, MapPin, MoreHorizontal, Sparkles, Star, Trash2, Wifi, X, Bookmark, Send } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt, sourceName } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { Dialog } from "@/components/kit/dialog";
import { Menu, MenuItem } from "@/components/kit/menu";
import { CompanyAvatar, Progress } from "@/components/kit";
import { PostingLink } from "@/components/posting-link";
import { ScoreRing, StateChip, VerdictChip, daysUntil, fmtDate, scoreColor, scoreLabel } from "@/components/ui";
import type { AppState } from "@/lib/types";
import type { SavedView } from "@/lib/repo/offers";
import { BEST_BATCH, applyFilters, filtersToQuery, parseFilters, type OfferFilters, type OfferRow } from "@/lib/offers-filter";
import { applyTo, archiveOffers, deleteOffers, evaluateOffer, starOffers, tailorCvFor, trackOffers, undoDelete } from "@/app/actions/jobs";
import { OffersToolbar } from "./offers-toolbar";
import { EvergreenChip } from "./evergreen-chip";

type Patch = { ids: number[]; patch?: Partial<OfferRow>; remove?: boolean };
type View = "table" | "cards";

// Layout preference lives in localStorage; read through an external store so SSR and hydration agree.
const VIEW_KEY = "khedma:offers-view";
const viewListeners = new Set<() => void>();
let memView: View | null = null;
const readView = (): View | null => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === "cards" || v === "table") return v;
  } catch {
    /* storage blocked: fall through to the width default */
  }
  return window.matchMedia("(max-width: 639px)").matches ? "cards" : null;
};
const writeView = (v: View) => {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* private mode: keep the in-memory choice only */
  }
  memView = v;
  viewListeners.forEach((l) => l());
};
const subscribeView = (l: () => void) => {
  viewListeners.add(l);
  return () => viewListeners.delete(l);
};

export function OffersBrowser({
  all,
  filters: initialFilters,
  views,
  sources,
  countryCodes,
  myCountries,
  pending,
  autoEvaluate,
}: {
  all: OfferRow[];
  filters: OfferFilters;
  views: SavedView[];
  sources: string[];
  countryCodes: string[];
  myCountries: string[];
  pending: { id: number; title: string }[];
  autoEvaluate: boolean;
}) {
  const { t, locale } = useT();
  const o = t.offers2;
  const toast = useToast();
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [, startAction] = useTransition();

  const storedView = useSyncExternalStore(subscribeView, () => memView ?? readView(), () => null);
  const view: View = storedView ?? "table";

  // Filters apply instantly in the browser; the URL is kept in sync without a server round-trip,
  // except for "archived" which needs a different dataset from the server.
  const [filters, setFilters] = useState<OfferFilters>(initialFilters);
  const query = filtersToQuery(filters);
  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const p = new URLSearchParams(filtersToQuery(filters));
      for (const [k, v] of Object.entries(patch)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      const next = parseFilters(p);
      const s = filtersToQuery(next);
      if (next.archived !== filters.archived) {
        startNav(() => router.replace(s ? `/app/jobs?${s}` : "/app/jobs", { scroll: false }));
        return;
      }
      setFilters(next);
      window.history.replaceState(null, "", s ? `/app/jobs?${s}` : "/app/jobs");
    },
    [filters, router],
  );
  const rows = useMemo(() => applyFilters(all, filters), [all, filters]);

  // ---------- optimistic rows ----------
  const [list, applyPatch] = useOptimistic(rows, (cur: OfferRow[], p: Patch) =>
    p.remove ? cur.filter((r) => !p.ids.includes(r.id)) : cur.map((r) => (p.ids.includes(r.id) ? { ...r, ...p.patch } : r)),
  );
  const [live, setLive] = useState<Record<number, Pick<OfferRow, "score" | "verdict">>>({});
  // Scores from this run show at once, re-scores included, without waiting for the whole batch.
  const shown = useMemo(() => list.map((r) => (live[r.id] ? { ...r, ...live[r.id] } : r)), [list, live]);
  // ~50 rows at a time: hundreds of rows made a 47,000 px page and a 7 s server render.
  const [paged, setPaged] = useState({ query, n: PAGE });
  const limit = paged.query === query ? paged.n : PAGE;
  const page = useMemo(() => shown.slice(0, limit), [shown, limit]);
  const hidden = useMemo(() => (filters.all || filters.archived ? 0 : applyFilters(all, { ...filters, all: true }).length - rows.length), [all, filters, rows]);
  const unscoredHidden = useMemo(() => (filters.min ? applyFilters(all, { ...filters, min: 0 }).filter((r) => r.score === null).length : 0), [all, filters]);

  // ---------- selection + keyboard cursor ----------
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const visibleIds = useMemo(() => new Set(shown.map((r) => r.id)), [shown]);
  const sel = useMemo(() => [...selected].filter((id) => visibleIds.has(id)), [selected, visibleIds]);
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOn = page.length > 0 && page.every((r) => selected.has(r.id));
  const cursor = useRef(-1);

  // ---------- mutations ----------
  const run = (patch: Patch, fn: () => Promise<unknown>) =>
    startAction(async () => {
      applyPatch(patch);
      await fn();
    });

  const star = (ids: number[], on: boolean) =>
    run({ ids, patch: { starred: on } }, async () => {
      const n = await starOffers(ids, on);
      if (ids.length > 1) toast.success(fmt(on ? o.toastStarred : o.toastUnstarred, { n }));
    });

  const archive = (ids: number[], merged = false) => {
    const to = !filters.archived;
    run({ ids, remove: true }, async () => {
      const n = await archiveOffers(ids, to);
      setSelected(new Set());
      toast.success(fmt(merged ? o.toastMerged : to ? o.toastArchived : o.toastRestored, { n }), undefined, {
        label: o.undo,
        onClick: () => startAction(async () => void (await archiveOffers(ids, !to))),
      });
    });
  };

  const track = (ids: number[]) => {
    const fresh = ids.filter((id) => !shown.find((r) => r.id === id)?.appId);
    run({ ids: fresh, patch: { status: "evaluated", appId: -1 } }, async () => {
      await trackOffers(fresh);
      // Count only the offers that were not tracked yet, and point at where they went.
      toast.success(fmt(o.toastTracked, { n: fresh.length }), undefined, { label: o.openPipeline, onClick: () => router.push("/app/pipeline") });
    });
  };

  const [confirmIds, setConfirmIds] = useState<number[] | null>(null);
  const doDelete = (ids: number[]) =>
    run({ ids, remove: true }, async () => {
      setConfirmIds(null);
      const { n, token } = await deleteOffers(ids);
      setSelected(new Set());
      toast.success(fmt(o.toastDeleted, { n }), undefined, token
        ? {
            label: o.undo,
            onClick: () =>
              startAction(async () => {
                if (await undoDelete(token)) toast.success(o.toastUndone);
                else toast.error(o.undoExpired);
              }),
          }
        : undefined);
    });

  // ---------- sequential evaluation ----------
  const [progress, setProgress] = useState<{ i: number; n: number; title: string } | null>(null);
  useEffect(() => {
    if (!progress) return;
    const hold = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", hold);
    return () => window.removeEventListener("beforeunload", hold);
  }, [progress]);
  const cancel = useRef(false);
  const [stopping, setStopping] = useState(false);
  const running = useRef(false);
  const evaluate = useCallback(
    async (items: { id: number; title: string }[]) => {
      if (running.current) {
        toast.info(o.evalBusy);
        return;
      }
      if (!items.length) {
        toast.info(o.evalNone);
        return;
      }
      running.current = true;
      cancel.current = false;
      let done = 0;
      let failed = 0;
      for (let i = 0; i < items.length; i++) {
        if (cancel.current) break;
        setProgress({ i: i + 1, n: items.length, title: items[i].title });
        const r = await evaluateOffer(items[i].id);
        if (r.ok && r.global !== undefined && r.verdict) {
          done++;
          setLive((m) => ({ ...m, [items[i].id]: { score: r.global!, verdict: r.verdict! } }));
        } else failed++;
      }
      setProgress(null);
      setStopping(false);
      running.current = false;
      router.refresh();
      if (cancel.current) toast.info(fmt(o.evalStopped, { n: done }));
      else if (failed) toast.error(fmt(o.evalDone, { n: done }), fmt(o.evalFailed, { n: failed }));
      else toast.success(fmt(o.evalDone, { n: done }));
    },
    [o, router, toast],
  );

  // Today and the command palette send ?evaluate=1: score the best unscored matches once, then drop the flag.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoEvaluate || autoRan.current) return;
    autoRan.current = true;
    router.replace(query ? `/app/jobs?${query}` : "/app/jobs", { scroll: false });
    void evaluate(pending.slice(0, BEST_BATCH));
  }, [autoEvaluate, evaluate, pending, query, router]);

  // Header "Score N new" button (server-rendered) asks through a window event.
  useEffect(() => {
    // "Score the 20 best matches": pending comes best keyword match first; rows of the current list go first.
    const on = () => void evaluate([...pending.filter((p) => visibleIds.has(p.id)), ...pending.filter((p) => !visibleIds.has(p.id))].slice(0, BEST_BATCH));
    window.addEventListener("khedma:score-pending", on);
    return () => window.removeEventListener("khedma:score-pending", on);
  }, [evaluate, pending, visibleIds]);

  // ---------- keyboard: j/k move, x select, s star (Enter is native on the focused link) ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("dialog,[popover]")) return;
      if (e.ctrlKey || e.metaKey || e.altKey || !shown.length) return;
      const k = e.key.toLowerCase();
      if (k === "j" || k === "k") {
        e.preventDefault();
        const next = Math.max(0, Math.min(page.length - 1, cursor.current + (k === "j" ? 1 : -1)));
        cursor.current = next;
        document.getElementById(`offer-${page[next].id}`)?.focus();
      } else if ((k === "x" || k === "s") && cursor.current >= 0 && page[cursor.current]) {
        e.preventDefault();
        const r = page[cursor.current];
        if (k === "x") toggle(r.id);
        else star([r.id], !r.starred);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selRows = shown.filter((r) => sel.includes(r.id));
  const dupSel = selRows.filter((r) => r.dup?.newer).map((r) => r.id);
  const allStarred = selRows.length > 0 && selRows.every((r) => r.starred);
  const evalItems = (ids: number[]) => shown.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, title: r.title }));

  const rowProps = (r: OfferRow, i: number): RowProps => ({
    r,
    selected: selected.has(r.id),
    onToggle: () => toggle(r.id),
    onFocus: () => (cursor.current = i),
    onStar: () => star([r.id], !r.starred),
    onEvaluate: () => void evaluate([{ id: r.id, title: r.title }]),
    onTrack: () => track([r.id]),
    onTailor: () => startAction(async () => await tailorCvFor(r.id)),
    onApply: () => startAction(async () => await applyTo(r.id)),
    onArchive: () => archive([r.id]),
    onDelete: () => setConfirmIds([r.id]),
    archivedView: filters.archived,
    locale,
  });

  return (
    <>
      <OffersToolbar filters={filters} setParams={setParams} sources={sources} countries={countryCodes} myCountries={myCountries} view={view} setView={writeView} views={views} query={query} />

      <div aria-live="polite" className="sr-only">{progress ? fmt(o.progress, { i: progress.i, n: progress.n }) : ""}</div>
      {progress && (
        <div className="card mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-saffron/40 p-3.5">
          <Sparkles size={18} aria-hidden="true" className="animate-[spin_1.6s_linear_infinite] text-saffron" />
          <div className="min-w-48 flex-1">
            <p className="text-sm font-semibold tabular">{fmt(o.progress, { i: progress.i, n: progress.n })}</p>
            <p className="mb-2 truncate text-xs text-muted">{fmt(o.current, { title: progress.title })}</p>
            <Progress value={progress.i - 1} max={progress.n} label={o.progressLabel} tone="saffron" />
          </div>
          <button type="button" className="btn btn-outline btn-sm" disabled={stopping} aria-busy={stopping} onClick={() => { cancel.current = true; setStopping(true); }}>
            <X size={14} aria-hidden="true" /> {stopping ? o.stopping : o.stop}
          </button>
        </div>
      )}

      {sel.length > 0 && (
        <div role="region" aria-label={o.bulkLabel} className="card sticky top-[60px] z-20 mb-3 flex flex-wrap items-center gap-2 p-2.5 shadow-[var(--shadow)]">
          <span className="px-2 text-sm font-semibold tabular">{fmt(o.selected, { n: sel.length })}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!progress} onClick={() => void evaluate(evalItems(sel))}>
            <Sparkles size={14} aria-hidden="true" /> {o.evaluate}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => track(sel)}>
            <Bookmark size={14} aria-hidden="true" /> {o.track}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => star(sel, !allStarred)}>
            <Star size={14} aria-hidden="true" /> {allStarred ? o.unstar : o.star}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => archive(sel)}>
            {filters.archived ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
            {filters.archived ? o.restore : o.archive}
          </button>
          {dupSel.length > 0 && !filters.archived && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => archive(dupSel, true)}>
              <Copy size={14} aria-hidden="true" /> {fmt(o.merge, { n: dupSel.length })}
            </button>
          )}
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmIds(sel)}>
            <Trash2 size={14} aria-hidden="true" /> {o.delete}
          </button>
          <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => setSelected(new Set())}>
            <X size={14} aria-hidden="true" /> {o.clearSelection}
          </button>
        </div>
      )}

      <div aria-busy={navPending} className={`transition-opacity ${navPending ? "opacity-60" : ""}`}>
        {shown.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <p className="display text-xl">{o.noMatch}</p>
            <p className="mt-2 text-muted">{o.noMatchHint}</p>
            <Link href="/app/jobs" className="btn btn-outline mt-5">{o.clear}</Link>
          </div>
        ) : view === "table" ? (
          <div className="card overflow-x-auto">
            <div className="min-w-[880px]" role="table" aria-label={o.title}>
              <div role="row" className={`${GRID} border-b border-line px-4 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted`}>
                <span role="columnheader">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    aria-label={o.col.selectAll}
                    checked={allOn}
                    onChange={() => setSelected(allOn ? new Set() : new Set(page.map((r) => r.id)))}
                  />
                </span>
                <span role="columnheader">{o.list2.col.offer}</span>
                <span role="columnheader">{o.list2.col.typePlace}</span>
                <span role="columnheader">{o.list2.col.fit}</span>
                <span role="columnheader">{o.list2.col.deadline}</span>
                <span role="columnheader">{o.list2.col.status}</span>
                <span role="columnheader" className="sr-only">{o.col.actions}</span>
              </div>
              <ul role="rowgroup">
                {page.map((r, i) => (
                  <TableRow key={r.id} {...rowProps(r, i)} />
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {page.map((r, i) => (
              <OfferCard key={r.id} {...rowProps(r, i)} i={i} />
            ))}
          </ul>
        )}
      </div>
      {shown.length > page.length && (
        <div className="mt-3 flex justify-center">
          <button type="button" className="btn btn-outline" onClick={() => setPaged({ query, n: limit + PAGE })}>
            {fmt(o.showMore, { n: Math.min(PAGE, shown.length - page.length), left: shown.length - page.length })}
          </button>
        </div>
      )}
      <p className="mt-2 text-right text-xs text-muted tabular" aria-live="polite">
        {fmt(o.count, { shown: page.length, total: shown.length })}
        {hidden > 0 && (
          <>
            {" · "}
            {fmt(o.hiddenExpired, { n: hidden })}{" "}
            <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => setParams({ all: "1" })}>{o.showHidden}</button>
          </>
        )}
        {filters.all && !filters.archived && (
          <>
            {" · "}
            <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => setParams({ all: null })}>{o.hideExpired}</button>
          </>
        )}
        {unscoredHidden > 0 && <> · {fmt(o.unscoredHidden, { n: unscoredHidden })}</>}
      </p>

      <Dialog
        open={!!confirmIds}
        onClose={() => setConfirmIds(null)}
        title={o.confirmDeleteTitle}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmIds(null)}>{t.common.cancel}</button>
            <button type="button" className="btn btn-danger" onClick={() => confirmIds && doDelete(confirmIds)}>
              <Trash2 size={15} aria-hidden="true" /> {o.delete}
            </button>
          </>
        }
      >
        <p className="text-ink-2">{fmt(o.confirmDelete, { n: confirmIds?.length ?? 0 })}</p>
      </Dialog>
    </>
  );
}

const GRID = "grid grid-cols-[28px_minmax(0,2.2fr)_0.9fr_1fr_1.1fr_0.9fr_72px] items-center gap-3";
const PAGE = 50;

// ---------- rows ----------
interface RowProps {
  r: OfferRow;
  selected: boolean;
  onToggle: () => void;
  onFocus: () => void;
  onStar: () => void;
  onEvaluate: () => void;
  onTrack: () => void;
  onTailor: () => void;
  onApply: () => void;
  onArchive: () => void;
  onDelete: () => void;
  archivedView: boolean;
  locale: string;
}

const STATE_FG: Record<string, string> = {
  evaluated: "var(--ink-2)",
  applied: "var(--accent-text)",
  responded: "var(--accent-text)",
  interview: "var(--saffron)",
  offer: "var(--success)",
  hired: "var(--success)",
  rejected: "var(--danger)",
  discarded: "var(--muted)",
};
const VERDICT_FG = { apply_now: "var(--accent-text)", apply: "var(--success)", maybe: "var(--saffron)", skip: "var(--danger)" } as const;

function Deadline({ date, locale }: { date: string | null; locale: string }) {
  const { t } = useT();
  if (!date) return <span className="text-muted">—</span>;
  const d = daysUntil(date);
  if (d === null) return <span className="text-muted">—</span>;
  const fg = d < 0 ? "var(--muted)" : d <= 3 ? "var(--danger)" : d <= 7 ? "var(--saffron)" : "var(--ink-2)";
  return (
    <span className="block min-w-0 text-[0.8rem]">
      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: fg }}>
        <AlarmClock size={13} aria-hidden="true" />
        {d < 0 ? t.offers2.expired : d === 0 ? t.offers2.dToday : fmt(t.offers2.dMinus, { n: d })}
      </span>
      <span className={`block text-[0.72rem] text-muted ${d < 0 ? "line-through" : ""}`}>{fmtDate(date, locale)}</span>
    </span>
  );
}

function Fit({ r }: { r: OfferRow }) {
  const { t } = useT();
  if (r.score === null)
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.78rem] text-muted">
        {t.offers2.list2.notScored}
      </span>
    );
  return (
    <span className="flex min-w-0 items-center gap-2" role="img" aria-label={`${scoreLabel(t, r.score)}${r.verdict ? ` · ${t.verdicts[r.verdict]}` : ""}${r.engine === "heuristic" ? ` · ${t.offers2.list2.estimateHint}` : ""}`}>
      <span className="bar !w-[42px] shrink-0">
        <span style={{ width: `${((r.score - 1) / 4) * 100}%`, background: scoreColor(r.score) }} />
      </span>
      <span className="mono text-[0.82rem] font-semibold">{r.score.toFixed(1)}</span>
      {r.engine === "heuristic" && <span className="chip !h-5 !px-1.5 !py-0 text-[0.65rem] text-muted" title={t.offers2.list2.estimateHint}>{t.offers2.list2.estimate}</span>}
      {r.verdict && (
        <span className="truncate text-[0.72rem] font-semibold" style={{ color: VERDICT_FG[r.verdict] }}>
          {t.verdicts[r.verdict]}
        </span>
      )}
    </span>
  );
}

function Score({ r, size }: { r: OfferRow; size: number }) {
  const { t } = useT();
  return r.score !== null ? (
    <span className="inline-flex items-center gap-2">
      <ScoreRing value={r.score} size={size} label={scoreLabel(t, r.score)} animate={false} />
      {r.verdict && <VerdictChip verdict={r.verdict} t={t} />}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">{t.offers2.list2.notScored}</span>
  );
}

function StarButton({ r, onStar }: { r: OfferRow; onStar: () => void }) {
  const { t } = useT();
  return (
    <button
      type="button"
      className={`grid size-8 place-items-center rounded-lg transition-colors hover:bg-surface-2 ${r.starred ? "text-saffron" : "text-muted"}`}
      aria-pressed={r.starred}
      aria-label={`${r.starred ? t.offers2.unstar : t.offers2.star} : ${r.title}`}
      onClick={(e) => {
        e.stopPropagation();
        onStar();
      }}
    >
      <Star size={16} aria-hidden="true" fill={r.starred ? "currentColor" : "none"} />
    </button>
  );
}

/** The row's next step: open the apply workspace (tracks the offer if needed). */
function ApplyButton(p: RowProps) {
  const { t } = useT();
  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={(e) => {
        e.stopPropagation();
        p.onApply();
      }}
    >
      <Send size={13} aria-hidden="true" /> {t.offers2.apply}
    </button>
  );
}

function RowMenu(p: RowProps) {
  const { t } = useT();
  const o = t.offers2;
  const { r } = p;
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Menu label={fmt(o.rowActions, { title: r.title })} trigger={<MoreHorizontal size={16} aria-hidden="true" />}>
        <MenuItem href={`/app/jobs/${r.id}`}><ExternalLink size={14} aria-hidden="true" /> {o.open}</MenuItem>
        <MenuItem onClick={p.onEvaluate}><Sparkles size={14} aria-hidden="true" /> {r.score !== null ? o.reevaluate : o.evaluate}</MenuItem>
        <MenuItem onClick={p.onApply}><Send size={14} aria-hidden="true" /> {o.apply}</MenuItem>
        <MenuItem onClick={p.onTailor}><FileText size={14} aria-hidden="true" /> {o.tailorCv}</MenuItem>
        {r.appId && r.appId > 0 ? (
          <MenuItem href={`/app/pipeline/${r.appId}`}><Bookmark size={14} aria-hidden="true" /> {o.openApplication}</MenuItem>
        ) : (
          <MenuItem onClick={p.onTrack}><Bookmark size={14} aria-hidden="true" /> {o.track}</MenuItem>
        )}
        <MenuItem onClick={p.onStar}><Star size={14} aria-hidden="true" /> {r.starred ? o.unstar : o.star}</MenuItem>
        <MenuItem onClick={p.onArchive}>
          {p.archivedView ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />} {p.archivedView ? o.restore : o.archive}
        </MenuItem>
        <MenuItem danger onClick={p.onDelete}><Trash2 size={14} aria-hidden="true" /> {o.delete}</MenuItem>
      </Menu>
    </span>
  );
}

function DupChip({ r }: { r: OfferRow }) {
  const { t } = useT();
  if (!r.dup) return null;
  return (
    <Link href={`/app/jobs/${r.dup.id}`} className="chip chip-saffron !py-0 text-[0.68rem] hover:underline" title={fmt(t.offers2.dupOf, { title: r.dup.title })} onClick={(e) => e.stopPropagation()}>
      <Copy size={11} aria-hidden="true" /> <span aria-hidden="true">{t.offers2.dupChip}</span>
      <span className="sr-only">{fmt(t.offers2.dupOf, { title: r.dup.title })}</span>
    </Link>
  );
}

/** ponytail: a row click opens the offer page; the design's in-place drawer can replace it later with an intercepting route. */
function TableRow(p: RowProps) {
  const { t } = useT();
  const o = t.offers2;
  const router = useRouter();
  const { r } = p;
  return (
    <li
      role="row"
      className={`${GRID} cursor-pointer border-b border-line px-4 py-[11px] transition-colors last:border-b-0 hover:bg-surface-2 focus-within:bg-surface-2 ${p.selected ? "!bg-accent-soft/60" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,[popover]")) return;
        router.push(`/app/jobs/${r.id}`);
      }}
    >
      <span role="cell" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="size-4 accent-[var(--accent)]" aria-label={`${o.col.select} : ${r.title}`} checked={p.selected} onChange={p.onToggle} />
      </span>
      <div role="cell" className="flex min-w-0 items-center gap-3">
        <CompanyAvatar name={r.company} size={34} />
        <div className="min-w-0">
          <Link id={`offer-${r.id}`} href={`/app/jobs/${r.id}`} onFocus={p.onFocus} className="block truncate text-[0.9rem] font-semibold text-ink hover:text-accent-text">
            {r.title}
          </Link>
          <p className="flex items-center gap-1.5 truncate text-[0.75rem] text-muted">
            <span className="truncate">
              {r.company} · {o.list2.via} {sourceName(t, r.source)} · {fmtDate(r.created_at, p.locale)}
            </span>
            <DupChip r={r} />
            <EvergreenChip reasons={r.evergreen} t={t} />
          </p>
        </div>
      </div>
      <div role="cell" className="min-w-0 text-[0.8rem] text-ink-2">
        <p className="font-medium">{t.jobTypes[r.type]}</p>
        <p className="truncate text-muted">
          {r.location || (r.remote ? "" : "—")}
          {r.remote && (
            <span className="inline-flex items-center gap-1 text-accent-text">
              {r.location ? " · " : ""}
              <Wifi size={11} aria-hidden="true" />
              {t.offers2.remote}
            </span>
          )}
        </p>
      </div>
      <div role="cell" className="min-w-0"><Fit r={r} /></div>
      <div role="cell" className="min-w-0"><Deadline date={r.deadline} locale={p.locale} /></div>
      <div role="cell" className="min-w-0">
        {r.status && r.status !== "evaluated" ? (
          <span className="status" style={{ color: STATE_FG[r.status] ?? "var(--ink-2)" }}>{t.states[r.status as AppState]}</span>
        ) : p.archivedView ? (
          <span className="text-[0.78rem] text-muted">{o.list2.notTracked}</span>
        ) : (
          <ApplyButton {...p} />
        )}
      </div>
      <div role="cell" className="flex items-center justify-end">
        <StarButton r={r} onStar={p.onStar} />
        <RowMenu {...p} />
      </div>
    </li>
  );
}

function OfferCard(p: RowProps & { i: number }) {
  const { t } = useT();
  const { r } = p;
  return (
    <li
      className={`card card-hover relative flex flex-col gap-3 p-4 rise focus-within:border-line-strong ${p.selected ? "!border-accent bg-accent-soft/40" : ""}`}
      style={{ ["--i" as string]: Math.min(p.i, 8) }}
    >
      <div className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" aria-label={`${t.offers2.col.select} : ${r.title}`} checked={p.selected} onChange={p.onToggle} />
        <CompanyAvatar name={r.company} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.78rem] text-muted">{r.company} · {t.jobTypes[r.type]}</p>
          <Link id={`offer-${r.id}`} href={`/app/jobs/${r.id}`} onFocus={p.onFocus} className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-ink hover:text-accent-text">
            {r.title}
          </Link>
        </div>
        <div className="-mr-1 -mt-1 flex">
          <PostingLink job={r} variant="ghost" iconOnly />
          <StarButton r={r} onStar={p.onStar} />
          <RowMenu {...p} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
        {r.location && <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden="true" />{r.location}</span>}
        {r.remote && <span className="inline-flex items-center gap-1 text-accent-text"><Wifi size={13} aria-hidden="true" />{t.offers2.remote}</span>}
        <DupChip r={r} />
        <EvergreenChip reasons={r.evergreen} t={t} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <Score r={r} size={34} />
        <div className="flex items-center gap-2">
          {r.status && r.status !== "evaluated" ? <StateChip state={r.status as AppState} t={t} /> : !p.archivedView && <ApplyButton {...p} />}
          <Deadline date={r.deadline} locale={p.locale} />
        </div>
      </div>
    </li>
  );
}
