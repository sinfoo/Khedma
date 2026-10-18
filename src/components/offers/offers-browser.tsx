"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, Archive, ArchiveRestore, Copy, ExternalLink, FileText, MapPin, MoreHorizontal, Sparkles, Star, Trash2, Wifi, X, Bookmark, Send } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { Dialog } from "@/components/kit/dialog";
import { Menu, MenuItem } from "@/components/kit/menu";
import { CompanyAvatar, Progress } from "@/components/kit";
import { PostingLink } from "@/components/posting-link";
import { ScoreRing, StateChip, VerdictChip, daysUntil, fmtDate, scoreColor, scoreLabel } from "@/components/ui";
import type { AppState } from "@/lib/types";
import type { SavedView } from "@/lib/repo/offers";
import { applyFilters, filtersToQuery, parseFilters, type OfferFilters, type OfferRow } from "@/lib/offers-filter";
import { applyTo, archiveOffers, deleteOffers, evaluateOffer, starOffers, tailorCvFor, trackOffers, undoDelete } from "@/app/actions/jobs";
import { OffersToolbar } from "./offers-toolbar";

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
  total,
  filters: initialFilters,
  views,
  sources,
  countryCodes,
  myCountries,
  pending,
  autoEvaluate,
}: {
  all: OfferRow[];
  total: number;
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
  const shown = useMemo(() => list.map((r) => (live[r.id] && r.score === null ? { ...r, ...live[r.id] } : r)), [list, live]);

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
  const allOn = shown.length > 0 && sel.length === shown.length;
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

  const track = (ids: number[]) =>
    run({ ids: ids.filter((id) => !shown.find((r) => r.id === id)?.appId), patch: { status: "evaluated", appId: -1 } }, async () => {
      const n = await trackOffers(ids);
      toast.success(fmt(o.toastTracked, { n }));
    });

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
  const cancel = useRef(false);
  const running = useRef(false);
  const evaluate = useCallback(
    async (items: { id: number; title: string }[]) => {
      if (running.current) return;
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
      running.current = false;
      router.refresh();
      if (cancel.current) toast.info(fmt(o.evalStopped, { n: done }));
      else if (failed) toast.error(fmt(o.evalDone, { n: done }), fmt(o.evalFailed, { n: failed }));
      else toast.success(fmt(o.evalDone, { n: done }));
    },
    [o, router, toast],
  );

  // Command palette sends ?evaluate=1: evaluate every unevaluated offer once, then drop the flag.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoEvaluate || autoRan.current) return;
    autoRan.current = true;
    router.replace(query ? `/app/jobs?${query}` : "/app/jobs", { scroll: false });
    void evaluate(pending);
  }, [autoEvaluate, evaluate, pending, query, router]);

  // Header "Score N new" button (server-rendered) asks through a window event.
  useEffect(() => {
    // Rows matching the current filters go first, so a narrowed list gets its scores long before the rest.
    const on = () => void evaluate([...pending.filter((p) => visibleIds.has(p.id)), ...pending.filter((p) => !visibleIds.has(p.id))]);
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
        const next = Math.max(0, Math.min(shown.length - 1, cursor.current + (k === "j" ? 1 : -1)));
        cursor.current = next;
        document.getElementById(`offer-${shown[next].id}`)?.focus();
      } else if ((k === "x" || k === "s") && cursor.current >= 0 && shown[cursor.current]) {
        e.preventDefault();
        const r = shown[cursor.current];
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
          <button type="button" className="btn btn-outline btn-sm" onClick={() => (cancel.current = true)}>
            <X size={14} aria-hidden="true" /> {o.stop}
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
            <div className="min-w-[880px]">
              <div className={`${GRID} border-b border-line px-4 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted`}>
                <span>
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    aria-label={o.col.selectAll}
                    checked={allOn}
                    onChange={() => setSelected(allOn ? new Set() : new Set(shown.map((r) => r.id)))}
                  />
                </span>
                <span>{o.list2.col.offer}</span>
                <span>{o.list2.col.typePlace}</span>
                <span>{o.list2.col.fit}</span>
                <span>{o.list2.col.deadline}</span>
                <span>{o.list2.col.status}</span>
                <span className="sr-only">{o.col.actions}</span>
              </div>
              <ul>
                {shown.map((r, i) => (
                  <TableRow key={r.id} {...rowProps(r, i)} />
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((r, i) => (
              <OfferCard key={r.id} {...rowProps(r, i)} i={i} />
            ))}
          </ul>
        )}
      </div>
      <p className="mt-2 text-right text-xs text-muted tabular" aria-live="polite">{fmt(o.count, { shown: shown.length, total })}</p>

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
      <span className="inline-flex items-center gap-1.5 text-[0.78rem] font-semibold text-saffron">
        <Sparkles size={13} aria-hidden="true" /> {t.offers2.list2.notScored}
      </span>
    );
  return (
    <span className="flex min-w-0 items-center gap-2" role="img" aria-label={scoreLabel(t, r.score)}>
      <span className="bar !w-[42px] shrink-0">
        <span style={{ width: `${((r.score - 1) / 4) * 100}%`, background: scoreColor(r.score) }} />
      </span>
      <span className="mono text-[0.82rem] font-semibold">{r.score.toFixed(1)}</span>
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
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-saffron"><Sparkles size={12} aria-hidden="true" /> {t.offers2.list2.notScored}</span>
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
      className={`${GRID} cursor-pointer border-b border-line px-4 py-[11px] transition-colors last:border-b-0 hover:bg-surface-2 focus-within:bg-surface-2 ${p.selected ? "!bg-accent-soft/60" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,[popover]")) return;
        router.push(`/app/jobs/${r.id}`);
      }}
    >
      <span onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="size-4 accent-[var(--accent)]" aria-label={`${o.col.select} : ${r.title}`} checked={p.selected} onChange={p.onToggle} />
      </span>
      <div className="flex min-w-0 items-center gap-3">
        <CompanyAvatar name={r.company} size={34} />
        <div className="min-w-0">
          <Link id={`offer-${r.id}`} href={`/app/jobs/${r.id}`} onFocus={p.onFocus} className="block truncate text-[0.9rem] font-semibold text-ink hover:text-accent-text">
            {r.title}
          </Link>
          <p className="flex items-center gap-1.5 truncate text-[0.75rem] text-muted">
            <span className="truncate">
              {r.company} · {o.list2.via} {r.source} · {fmtDate(r.created_at, p.locale)}
            </span>
            <DupChip r={r} />
          </p>
        </div>
      </div>
      <div className="min-w-0 text-[0.8rem] text-ink-2">
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
      <Fit r={r} />
      <Deadline date={r.deadline} locale={p.locale} />
      <div className="min-w-0">
        {r.status ? (
          <span className="status" style={{ color: STATE_FG[r.status] ?? "var(--ink-2)" }}>{t.states[r.status as AppState]}</span>
        ) : (
          <span className="text-[0.78rem] text-muted">{o.list2.notTracked}</span>
        )}
      </div>
      <div className="flex items-center justify-end">
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
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <Score r={r} size={34} />
        <div className="flex items-center gap-2">
          {r.status && <StateChip state={r.status as AppState} t={t} />}
          <Deadline date={r.deadline} locale={p.locale} />
        </div>
      </div>
    </li>
  );
}
