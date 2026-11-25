"use client";

import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, CalendarClock, ChevronDown, ChevronRight, GitCompareArrows, GripVertical, Mic, MoreHorizontal, Search, Send } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { APP_STATES, type AppState, type JobType } from "@/lib/types";
import { CompanyAvatar } from "@/components/kit";
import { Menu, MenuItem } from "@/components/kit/menu";
import { ScoreRing, StateChip, scoreLabel } from "./ui";
import { useStageMove } from "./pipeline/stage";
import { shortDate } from "./pipeline/format";
import { CadenceChip, type CadenceView } from "./pipeline/cadence";
import { fold } from "@/lib/sources/classify";

export interface BoardItem {
  id: number;
  status: AppState;
  title: string;
  company: string;
  type: JobType;
  score: number | null;
  updated_at: string;
  stageDays: number;
  next_action_at: string | null;
  overdue: boolean;
  interviewAt: string | null;
  contacts: number;
  url: string;
  location: string;
  source: string;
  cadence: CadenceView | null;
  /** The offer's deadline, and whether the tailored CV and letter exist (cards still to send). */
  deadline: string | null;
  docs: { cv: boolean; letter: boolean };
}

const ACTIVE: AppState[] = ["evaluated", "applied", "responded", "interview", "offer", "hired"];
const CLOSED: AppState[] = ["rejected", "discarded"];
const ORDER: AppState[] = [...ACTIVE, ...CLOSED];
/** Cards shown per column before "Show more": a long "To apply" list must not bury the other stages. */
const CAP = 5;
type SortKey = "stage" | "score" | "updated" | "next";

const DOT: Record<AppState, string> = {
  evaluated: "var(--line-strong)",
  applied: "var(--accent)",
  responded: "var(--accent)",
  interview: "var(--saffron)",
  offer: "var(--success)",
  hired: "var(--success)",
  rejected: "var(--danger)",
  discarded: "var(--muted)",
};

/** Stage board: cards move with one click (next stage →), the ⋯ menu (any stage), drag, or the keyboard. */
export function PipelineBoard({ items, initialView }: { items: BoardItem[]; initialView: "board" | "table" }) {
  const { t, locale } = useT();
  const b = t.apps2.board;
  const f = t.apps2.flow;
  // Deadlines within 3 days turn red on cards still to send; a passed one says so.
  const today = new Date().toLocaleDateString("sv");
  const soon = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("sv");
  const [opt, setOpt] = useOptimistic(items, (state, m: { id: number; status: AppState }) => state.map((x) => (x.id === m.id ? { ...x, status: m.status } : x)));
  const [live, setLive] = useState("");
  const { move, node } = useStageMove((id, status) => setOpt({ id, status }));
  const [view, setView] = useState(initialView);
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "updated", dir: -1 });
  const [grab, setGrab] = useState<{ id: number; target: AppState } | null>(null);
  const [dragOver, setDragOver] = useState<AppState | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [openCols, setOpenCols] = useState<AppState[]>([]);
  const toggleSel = (id: number, on: boolean) => setSel((s) => (on ? (s.includes(id) ? s : [...s, id]) : s.filter((x) => x !== id)));

  // The moved card keeps the focus in its new column: on its handle, or on its title where the handle is hidden (stacked layout).
  useEffect(() => {
    if (focusId === null) return;
    const handle = document.getElementById(`grab-${focusId}`);
    (handle?.offsetParent ? handle : document.getElementById(`card-${focusId}`))?.focus();
  }, [focusId, opt]);

  const filtered = useMemo(() => {
    const needle = fold(q.trim());
    return opt.filter((x) => !needle || fold(`${x.title} ${x.company}`).includes(needle));
  }, [opt, q]);

  const switchView = (v: "board" | "table") => {
    setView(v);
    const u = new URL(window.location.href);
    if (v === "table") u.searchParams.set("view", "table");
    else u.searchParams.delete("view");
    window.history.replaceState(null, "", u);
  };

  const doMove = (item: BoardItem, to: AppState) => {
    setFocusId(item.id);
    // The toast says what moved, offers Undo and reports a failure: a second "moved" line here stayed up even when the move failed.
    move({ id: item.id, status: item.status, title: `${item.company} — ${item.title}` }, to);
  };

  const onHandleKey = (e: React.KeyboardEvent, item: BoardItem) => {
    const label = `${item.company} — ${item.title}`;
    // Only this card's own grab: Space on another handle used to drop that other card into the first one's column.
    const mine = grab?.id === item.id ? grab : null;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!mine) {
        setGrab({ id: item.id, target: item.status });
        setLive(fmt(b.picked, { title: label, col: t.states[item.status] }));
      } else {
        const to = mine.target;
        setGrab(null);
        if (to === item.status) setLive(b.cancelled);
        else doMove(item, to);
      }
    } else if (mine && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const i = ORDER.indexOf(mine.target) + (e.key === "ArrowRight" ? 1 : -1);
      const target = ORDER[Math.max(0, Math.min(ORDER.length - 1, i))];
      if (CLOSED.includes(target)) setShowClosed(true);
      setGrab({ id: item.id, target });
      setLive(fmt(b.over, { col: t.states[target] }));
    } else if (mine && e.key === "Escape") {
      e.preventDefault();
      setGrab(null);
      setLive(b.cancelled);
    }
  };

  const dropProps = (state: AppState) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragOver !== state) setDragOver(state);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const item = opt.find((x) => x.id === Number(e.dataTransfer.getData("text/plain")));
      if (item) doMove(item, state);
    },
  });

  const card = (item: BoardItem) => {
    const grabbed = grab?.id === item.id;
    const idx = ACTIVE.indexOf(item.status);
    const next = idx >= 0 && idx < ACTIVE.length - 1 ? ACTIVE[idx + 1] : null;
    const label = `${item.company} — ${item.title}`;
    const nextLine = item.interviewAt
      ? { icon: <Mic size={12} aria-hidden="true" />, text: fmt(b.interviewOn, { date: shortDate(item.interviewAt, locale) }), color: "var(--saffron)" }
      : item.next_action_at
        ? { icon: <CalendarClock size={12} aria-hidden="true" />, text: shortDate(item.next_action_at, locale), color: item.overdue ? "var(--danger)" : "var(--ink-2)" }
        : null;
    return (
      <li
        key={item.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", String(item.id));
          e.dataTransfer.effectAllowed = "move";
        }}
        className={`card card-shadow flex flex-col gap-2 p-3 ${grabbed ? "outline-2 outline-offset-2 outline-accent" : ""} ${item.status === "evaluated" && item.score !== null && item.score < 2.5 ? "opacity-70" : ""}`}
        style={{ ...(grabbed ? { outlineStyle: "solid" } : {}), animation: "rise .4s cubic-bezier(.2,.7,.2,1) both" }}
      >
        <div className="flex items-start gap-2">
          {/* Six busy columns at 1440 px leave about 150 px a card: the title needs the room more than the initials do. */}
          <span className="@max-[190px]:hidden"><CompanyAvatar name={item.company} size={28} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.7rem] text-muted">{item.company}</p>
            <Link id={`card-${item.id}`} href={`/app/pipeline/${item.id}`} className="line-clamp-2 text-[0.82rem] font-semibold leading-[1.3] text-ink hover:text-accent-text">
              {item.title}
            </Link>
          </div>
          {item.score !== null && <ScoreRing dec={t.a11y.decimal} value={item.score} size={28} label={scoreLabel(t, item.score)} animate={false} />}
        </div>
        {nextLine && (
          <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold" style={{ color: nextLine.color }}>
            {nextLine.icon}
            <span className="truncate">{nextLine.text}</span>
            {item.overdue && !item.interviewAt && <span className="sr-only">{b.overdue}</span>}
          </p>
        )}
        {/* Due follow-ups show even when a date line is there: "Candidature envoyée" cards always have one. */}
        {item.cadence && <CadenceChip c={item.cadence} t={t} locale={locale} />}
        {item.status === "evaluated" && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] text-muted">
            <span className={item.docs.cv ? "text-success" : ""}>{item.docs.cv ? "✓" : "○"} {f.packCv}</span>
            <span className={item.docs.letter ? "text-success" : ""}>{item.docs.letter ? "✓" : "○"} {f.packLetter}</span>
            {item.deadline && (
              <span className={`whitespace-nowrap font-semibold ${item.deadline.slice(0, 10) <= soon ? "text-danger" : "text-ink-2"}`}>
                {t.common.deadline} {shortDate(item.deadline, locale)}
                {item.deadline.slice(0, 10) < today && ` · ${t.offers2.expired}`}
              </span>
            )}
          </p>
        )}
        {/* One row where the column is wide; in a narrow one the stage button drops to a second row, still on the right. */}
        <div className="flex flex-wrap items-center justify-end gap-1 border-t border-line pt-2">
          <span className="tabular mr-auto whitespace-nowrap text-[0.7rem] text-muted">{fmt(f.hereDays, { n: item.stageDays })}</span>
          {/* Drag and the keyboard grab need columns side by side: hidden where the stages stack. */}
          <button
            id={`grab-${item.id}`}
            type="button"
            className="grid size-[26px] cursor-grab place-items-center rounded-[7px] text-muted hover:bg-surface-2 hover:text-ink max-lg:hidden"
            aria-label={fmt(b.grab, { title: label })}
            aria-describedby="dnd-help"
            aria-pressed={grabbed}
            onKeyDown={(e) => onHandleKey(e, item)}
            onBlur={() => {
              if (grabbed) {
                setGrab(null);
                setLive(b.cancelled);
              }
            }}
          >
            <GripVertical size={12} aria-hidden="true" />
          </button>
          {/* Any stage in two taps, closed ones included: the only way to move a card on a touch screen, where drag does nothing. */}
          <Menu label={fmt(b.moveLabel, { title: label })} trigger={<MoreHorizontal size={13} aria-hidden="true" />} triggerClassName="grid size-[26px] place-items-center rounded-[7px] border border-line bg-surface text-ink-2 hover:bg-surface-2">
            {ORDER.filter((s) => s !== item.status).map((s) => (
              <MenuItem key={s} onClick={() => doMove(item, s)} danger={s === "rejected"}>
                <span aria-hidden="true" className="size-2 rounded-full" style={{ background: DOT[s] }} /> {t.states[s]}
              </MenuItem>
            ))}
          </Menu>
          {/* Not sent yet: the next step is the review & apply step, which checks the CV and letter before marking it sent. */}
          {item.status === "evaluated" ? (
            <Link href={`/app/pipeline/${item.id}?tab=overview`} className="inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-[7px] bg-saffron px-2 text-[0.72rem] font-semibold text-saffron-ink hover:brightness-95">
              <Send size={12} aria-hidden="true" /> {t.offers2.apply}
            </Link>
          ) : next && (
            <button type="button" onClick={() => doMove(item, next)} className="inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-[7px] bg-accent-soft px-2 text-[0.72rem] font-semibold text-accent-text hover:brightness-95">
              {t.states[next]} <ArrowRight size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      </li>
    );
  };

  // What a card is waiting on: its next action, or the posting's deadline while it is still to send.
  const due = (x: BoardItem) => x.next_action_at ?? (x.status === "evaluated" ? x.deadline : null) ?? "9999";

  const column = (state: AppState, nested = false) => {
    // Dated cards first, then the best fit, then the newest: the five on show are the five to act on. Saving a note moves nothing.
    const col = filtered.filter((x) => x.status === state).sort((a, c) => due(a).localeCompare(due(c)) || (c.score ?? 0) - (a.score ?? 0) || c.id - a.id);
    const hot = dragOver === state || (grab && grab.target === state);
    const all = !!q || openCols.includes(state);
    // A card just moved or picked up stays in sight, past the cap or not.
    const shown = all ? col : col.filter((x, i) => i < CAP || x.id === focusId || x.id === grab?.id);
    // Side by side from 1024 px: busy columns share the width, empty ones shrink to a narrow drop target. Below, the stages stack.
    const width = nested ? "" : col.length ? "lg:min-w-[152px] lg:flex-1 lg:basis-0" : "lg:w-[124px] lg:shrink-0";
    return (
      <section
        key={state}
        aria-labelledby={`col-${state}`}
        {...dropProps(state)}
        className={`@container flex scroll-mt-20 flex-col gap-2 rounded-[14px] border p-2 transition-colors ${hot ? "border-accent bg-accent-soft" : "border-line bg-surface-2"} ${width}`}
      >
        <header className="flex items-start gap-2 px-1.5 pb-0.5 pt-1.5">
          <span aria-hidden="true" className="mt-[5px] size-2 shrink-0 rounded-full" style={{ background: DOT[state] }} />
          <h2 id={`col-${state}`} className="card-title min-w-0 flex-1 text-[0.82rem] leading-[1.3]">{t.states[state]}</h2>
          <span className="mono text-[0.72rem] text-muted">
            {/* A narrow empty column gives its width to the stage name ("Embauché·e" does not wrap); the box below already says it is empty. */}
            <span aria-hidden="true" className={col.length ? "" : "lg:hidden"}>{col.length}</span>
            <span className="sr-only">{fmt(t.pipeline.count, { n: col.length })}</span>
          </span>
        </header>
        {col.length ? (
          <ul className={nested ? "flex flex-col gap-2" : "grid gap-2 sm:grid-cols-2 lg:grid-cols-1"}>{shown.map(card)}</ul>
        ) : (
          // Stacked, an empty stage is its one-line header; in a row it keeps a box to drop on.
          <p className="rounded-[10px] border border-dashed border-line px-2 py-4 text-center text-[0.72rem] text-muted max-lg:hidden">{b.emptyCol}</p>
        )}
        {!q && col.length > CAP && (
          <button
            type="button"
            className="btn btn-ghost btn-sm w-full"
            aria-expanded={all}
            onClick={() => setOpenCols((s) => (all ? s.filter((x) => x !== state) : [...s, state]))}
          >
            {all ? b.showLess : fmt(b.showMore, { n: col.length - shown.length })}
          </button>
        )}
      </section>
    );
  };

  const sorted = useMemo(() => {
    const val = (x: BoardItem): number | string => {
      if (sort.key === "stage") return APP_STATES.indexOf(x.status);
      if (sort.key === "score") return x.score ?? -1;
      if (sort.key === "updated") return x.updated_at;
      return x.next_action_at ?? (sort.dir === 1 ? "9999" : "");
    };
    return [...filtered].sort((a, c) => (val(a) < val(c) ? -sort.dir : val(a) > val(c) ? sort.dir : 0));
  }, [filtered, sort]);

  const th = (key: SortKey, label: string, cls?: string) => (
    <th scope="col" className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 font-semibold hover:text-ink" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "next" ? 1 : -1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
      </button>
    </th>
  );

  return (
    <>
      <p className="sr-only" aria-live="assertive">{live}</p>
      <p id="dnd-help" className="sr-only">{b.dndHelp}</p>
      {node}

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-[320px]">
          <label htmlFor="pf-q" className="sr-only">{t.common.search}</label>
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input id="pf-q" type="search" className="input !h-[38px] !border-line !py-0 !pl-9 text-sm" placeholder={b.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div role="tablist" aria-label={b.viewLabel} className="seg">
          {(["board", "table"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => switchView(v)} className="seg-btn">
              {v === "board" ? b.viewBoard : b.viewTable}
            </button>
          ))}
        </div>
        {/* Beside the tab group, not in it: a tablist may only hold tabs. Offers are ticked in the table, which has its own
            Compare button, so from the board this opens the table (a link to ?view=table changed the address and nothing else). */}
        {view === "board" && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => switchView("table")}>
            {f.viewCompare}
          </button>
        )}
      </div>

      {q && filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-ink-2">{b.noMatch}</p>
          <button type="button" className="btn btn-outline btn-sm mt-4" onClick={() => setQ("")}>{b.clearFilters}</button>
        </div>
      ) : view === "board" ? (
        <>
        {/* Below 1024 px the stages stack, one under the other: jump straight to one instead of scrolling past the rest. */}
        <label className="mb-2.5 flex items-center gap-2 text-sm lg:hidden">
          <span className="text-muted">{b.jumpTo}</span>
          <select
            className="input !h-9 !w-auto !py-0 text-sm"
            value=""
            onChange={(e) => document.getElementById(`col-${e.target.value}`)?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <option value="" disabled>—</option>
            {ACTIVE.map((s) => (
              <option key={s} value={s}>{t.states[s]} ({filtered.filter((x) => x.status === s).length})</option>
            ))}
          </select>
        </label>
        {/* All six stages and the closed ones fit 1440 px without scrolling sideways; the row only scrolls on a narrower desktop with every stage in use. */}
        <div className="relative flex flex-col gap-2.5 lg:-mx-8 lg:flex-row lg:items-start lg:overflow-x-auto lg:px-8 lg:pb-3" aria-label={t.pipeline.board} role="region" tabIndex={0}>
          {/* relative: absolute bits (screen-reader text, rings) stay inside the scroller instead of widening the page. */}
          {ACTIVE.map((s) => column(s))}
          <section className={`flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-2 lg:shrink-0 ${showClosed ? "lg:w-[252px]" : "lg:w-[132px]"}`}>
            <header className="flex items-center justify-between px-1.5 pb-0.5 pt-1.5">
              <button type="button" className="inline-flex items-center gap-1 text-[0.82rem] font-semibold text-muted hover:text-ink" aria-expanded={showClosed} onClick={() => setShowClosed((v) => !v)}>
                {showClosed ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                {b.closed}
              </button>
            </header>
            {showClosed ? (
              <div className="flex flex-col gap-2">{CLOSED.map((s) => column(s, true))}</div>
            ) : (
              <>
                {CLOSED.map((s) => (
                  <div key={s} {...dropProps(s)} className={`flex justify-between gap-2 rounded-[10px] border border-dashed px-2.5 py-2.5 text-[0.75rem] transition-colors ${dragOver === s || grab?.target === s ? "border-accent bg-accent-soft text-ink" : "border-line text-muted"}`}>
                    {t.states[s]} <span className="mono">{filtered.filter((x) => x.status === s).length}</span>
                  </div>
                ))}
                <p className="p-1.5 text-[0.7rem] leading-[1.4] text-muted">{f.dropHint}</p>
              </>
            )}
          </section>
        </div>
        </>
      ) : (
        <div className="card relative overflow-x-auto">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-sm" aria-live="polite">
            <span className="text-muted">{fmt(t.apps2.compare.selected, { n: sel.length })}</span>
            {sel.length > 4 && <span className="text-xs text-danger">{t.apps2.compare.tooMany}</span>}
            {sel.length >= 2 && sel.length <= 4 ? (
              <Link href={`/app/pipeline/compare?ids=${sel.join(",")}`} className="btn btn-primary btn-sm ml-auto">
                <GitCompareArrows size={14} aria-hidden="true" /> {t.apps2.compare.compareCta}
              </Link>
            ) : (
              <span className="btn btn-primary btn-sm ml-auto opacity-50" aria-disabled="true" title={t.apps2.compare.needTwo}>
                <GitCompareArrows size={14} aria-hidden="true" /> {t.apps2.compare.compareCta}
              </span>
            )}
          </div>
          {/* On a phone the table keeps the offer and its stage, which fit the screen; the other columns come back from 640 px. */}
          <table className="table sm:min-w-[720px]">
            <caption className="sr-only">{t.pipeline.title}</caption>
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">{t.apps2.compare.compareCta}</span></th>
                <th scope="col">{b.colOffer}</th>
                {th("stage", b.colStage)}
                {th("score", b.colScore, "max-sm:hidden")}
                {th("updated", b.colUpdated, "max-sm:hidden")}
                {th("next", b.colNext, "max-sm:hidden")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((x) => (
                <tr key={x.id}>
                  <td>
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" aria-label={fmt(t.apps2.compare.select, { title: `${x.company} — ${x.title}` })} checked={sel.includes(x.id)} onChange={(e) => toggleSel(x.id, e.target.checked)} />
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <CompanyAvatar name={x.company} size={28} />
                      <div className="min-w-0">
                        <Link href={`/app/pipeline/${x.id}`} className="font-semibold hover:text-accent-text">{x.title}</Link>
                        <p className="text-xs text-muted">{x.company}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <StateChip state={x.status} t={t} />
                      <CadenceChip c={x.cadence} t={t} locale={locale} />
                    </span>
                  </td>
                  <td className="tabular max-sm:hidden">{x.score !== null ? x.score.toFixed(1) : "—"}</td>
                  <td className="tabular text-muted max-sm:hidden">{shortDate(x.updated_at, locale)}</td>
                  <td className={`tabular max-sm:hidden ${x.overdue ? "font-semibold text-danger" : "text-muted"}`}>
                    {x.overdue && <span className="sr-only">{b.overdue}: </span>}
                    {shortDate(x.next_action_at, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
