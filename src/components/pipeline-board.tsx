"use client";

import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarClock, ChevronDown, ChevronRight, GitCompareArrows, GripVertical, Mic, Search, Send } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { APP_STATES, type AppState, type JobType } from "@/lib/types";
import { CompanyAvatar } from "@/components/kit";
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

/** Stage board: cards move with one click (← / next stage →), drag, or the keyboard. */
export function PipelineBoard({ items, initialView }: { items: BoardItem[]; initialView: "board" | "table" }) {
  const { t, locale } = useT();
  const b = t.apps2.board;
  const f = t.apps2.flow;
  // Deadlines within 3 days turn red on cards still to send.
  const soon = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("sv");
  const [opt, setOpt] = useOptimistic(items, (state, m: { id: number; status: AppState }) => state.map((x) => (x.id === m.id ? { ...x, status: m.status } : x)));
  const [live, setLive] = useState("");
  const { move, node } = useStageMove((id, status) => setOpt({ id, status }), setLive);
  const [view, setView] = useState(initialView);
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "updated", dir: -1 });
  const [grab, setGrab] = useState<{ id: number; target: AppState } | null>(null);
  const [dragOver, setDragOver] = useState<AppState | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [moved, setMoved] = useState("");
  const toggleSel = (id: number, on: boolean) => setSel((s) => (on ? (s.includes(id) ? s : [...s, id]) : s.filter((x) => x !== id)));

  useEffect(() => {
    if (focusId !== null) document.getElementById(`grab-${focusId}`)?.focus();
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
    setMoved(fmt(b.moved, { title: `${item.company} — ${item.title}`, col: t.states[to] }));
    move({ id: item.id, status: item.status, title: `${item.company} — ${item.title}` }, to);
  };

  const onHandleKey = (e: React.KeyboardEvent, item: BoardItem) => {
    const label = `${item.company} — ${item.title}`;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!grab) {
        setGrab({ id: item.id, target: item.status });
        setLive(fmt(b.picked, { title: label, col: t.states[item.status] }));
      } else {
        const to = grab.target;
        setGrab(null);
        if (to === item.status) setLive(b.cancelled);
        else doMove(item, to);
      }
    } else if (grab && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const i = ORDER.indexOf(grab.target) + (e.key === "ArrowRight" ? 1 : -1);
      const target = ORDER[Math.max(0, Math.min(ORDER.length - 1, i))];
      if (CLOSED.includes(target)) setShowClosed(true);
      setGrab({ id: item.id, target });
      setLive(fmt(b.over, { col: t.states[target] }));
    } else if (grab && e.key === "Escape") {
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
    const prev = idx > 0 ? ACTIVE[idx - 1] : null;
    const next = idx >= 0 && idx < ACTIVE.length - 1 ? ACTIVE[idx + 1] : null;
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
          <CompanyAvatar name={item.company} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.7rem] text-muted">{item.company}</p>
            <Link href={`/app/pipeline/${item.id}`} className="line-clamp-2 text-[0.82rem] font-semibold leading-[1.3] text-ink hover:text-accent-text">
              {item.title}
            </Link>
          </div>
          {item.score !== null && <ScoreRing value={item.score} size={28} label={scoreLabel(t, item.score)} animate={false} />}
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
              </span>
            )}
          </p>
        )}
        <div className="flex items-center justify-between gap-1.5 border-t border-line pt-2">
          <span className="tabular whitespace-nowrap text-[0.7rem] text-muted">{fmt(f.hereDays, { n: item.stageDays })}</span>
          <div className="flex gap-1">
            <button
              id={`grab-${item.id}`}
              type="button"
              className="grid size-[26px] cursor-grab place-items-center rounded-[7px] text-muted hover:bg-surface-2 hover:text-ink"
              aria-label={fmt(b.grab, { title: `${item.company} — ${item.title}` })}
              aria-describedby="dnd-help"
              aria-pressed={grabbed}
              onKeyDown={(e) => onHandleKey(e, item)}
            >
              <GripVertical size={12} aria-hidden="true" />
            </button>
            {prev && (
              <button type="button" onClick={() => doMove(item, prev)} aria-label={`${f.moveBack} · ${t.states[prev]}`} className="grid size-[26px] place-items-center rounded-[7px] border border-line bg-surface text-ink-2 hover:bg-surface-2">
                <ArrowLeft size={12} aria-hidden="true" />
              </button>
            )}
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
        </div>
      </li>
    );
  };

  const column = (state: AppState, compact = false) => {
    const col = filtered.filter((x) => x.status === state);
    const hot = dragOver === state || (grab && grab.target === state);
    return (
      <section
        key={state}
        aria-labelledby={`col-${state}`}
        {...dropProps(state)}
        className={`flex min-h-[360px] flex-col gap-2 rounded-[14px] border p-2 transition-colors ${hot ? "border-accent bg-accent-soft" : "border-line bg-surface-2"} ${compact ? "" : "w-[236px] shrink-0 snap-start"}`}
      >
        <header className="flex items-center gap-2 px-1.5 pb-0.5 pt-1.5">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ background: DOT[state] }} />
          <h2 id={`col-${state}`} className="card-title flex-1 text-[0.82rem]">{t.states[state]}</h2>
          <span className="mono text-[0.72rem] text-muted">
            <span aria-hidden="true">{col.length}</span>
            <span className="sr-only">{fmt(t.pipeline.count, { n: col.length })}</span>
          </span>
        </header>
        {col.length ? <ul className="flex flex-col gap-2">{col.map(card)}</ul> : <p className="grid flex-1 place-items-center rounded-[10px] border border-dashed border-line p-4 text-center text-[0.75rem] text-muted">{b.emptyCol}</p>}
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

  const th = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
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
        {/* A link, so it sits beside the tab group: a tablist may only hold tabs. */}
        <Link href={sel.length >= 2 && sel.length <= 4 ? `/app/pipeline/compare?ids=${sel.join(",")}` : "/app/pipeline?view=table"} className="btn btn-outline btn-sm" title={sel.length < 2 ? t.apps2.compare.needTwo : undefined}>
          {f.viewCompare}
        </Link>
      </div>

      {q && filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-ink-2">{b.noMatch}</p>
          <button type="button" className="btn btn-outline btn-sm mt-4" onClick={() => setQ("")}>{b.clearFilters}</button>
        </div>
      ) : view === "board" ? (
        <div className="-mx-4 flex snap-x items-start gap-3 overflow-x-auto px-4 pb-3 sm:-mx-8 sm:px-8" aria-label={t.pipeline.board} role="region" tabIndex={0}>
          {ACTIVE.map((s) => column(s))}
          <section className={`flex min-h-[360px] shrink-0 flex-col gap-2 rounded-[14px] border border-line bg-surface p-2 ${showClosed ? "w-[252px]" : "w-[160px]"}`}>
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
                  <div key={s} {...dropProps(s)} className={`flex justify-between rounded-[10px] border border-dashed px-2.5 py-2.5 text-[0.75rem] transition-colors ${dragOver === s || grab?.target === s ? "border-accent bg-accent-soft text-ink" : "border-line text-muted"}`}>
                    {t.states[s]} <span className="mono">{filtered.filter((x) => x.status === s).length}</span>
                  </div>
                ))}
                <p className="mt-auto p-1.5 text-[0.7rem] leading-[1.4] text-muted">{f.dropHint}</p>
              </>
            )}
          </section>
        </div>
      ) : (
        <div className="card overflow-x-auto">
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
          <table className="table min-w-[720px]">
            <caption className="sr-only">{t.pipeline.title}</caption>
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">{t.apps2.compare.compareCta}</span></th>
                <th scope="col">{b.colOffer}</th>
                {th("stage", b.colStage)}
                {th("score", b.colScore)}
                {th("updated", b.colUpdated)}
                {th("next", b.colNext)}
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
                  <td className="tabular">{x.score !== null ? x.score.toFixed(1) : "—"}</td>
                  <td className="tabular text-muted">{shortDate(x.updated_at, locale)}</td>
                  <td className={`tabular ${x.overdue ? "font-semibold text-danger" : "text-muted"}`}>
                    {x.overdue && <span className="sr-only">{b.overdue}: </span>}
                    {shortDate(x.next_action_at, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {moved && <p role="status" className="mt-3.5 text-[0.82rem] text-muted" style={{ animation: "fade .3s ease both" }}>{moved}</p>}
    </>
  );
}
