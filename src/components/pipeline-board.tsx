"use client";

import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useState } from "react";
import { ArrowDown, ArrowUp, CalendarClock, ChevronDown, ChevronRight, Clock, GripVertical, Kanban, Mic, Search, Table2, Users } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { APP_STATES, JOB_TYPES, type AppState, type JobType } from "@/lib/types";
import { CompanyAvatar } from "@/components/kit";
import { ScoreRing, StateChip, scoreLabel } from "./ui";
import { useStageMove } from "./pipeline/stage";
import { shortDate } from "./pipeline/format";

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
}

const ACTIVE: AppState[] = ["evaluated", "applied", "responded", "interview", "offer", "hired"];
const CLOSED: AppState[] = ["rejected", "discarded"];
const ORDER: AppState[] = [...ACTIVE, ...CLOSED];
type SortKey = "stage" | "score" | "updated" | "next";

export function PipelineBoard({ items, initialView }: { items: BoardItem[]; initialView: "board" | "table" }) {
  const { t, locale } = useT();
  const b = t.apps2.board;
  const [opt, setOpt] = useOptimistic(items, (state, m: { id: number; status: AppState }) => state.map((x) => (x.id === m.id ? { ...x, status: m.status } : x)));
  const [live, setLive] = useState("");
  const { move, node } = useStageMove((id, status) => setOpt({ id, status }), setLive);
  const [view, setView] = useState(initialView);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [showClosed, setShowClosed] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "updated", dir: -1 });
  const [grab, setGrab] = useState<{ id: number; target: AppState } | null>(null);
  const [dragOver, setDragOver] = useState<AppState | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);

  // A moved card re-mounts in its new column: give focus back to its handle.
  useEffect(() => {
    if (focusId !== null) document.getElementById(`grab-${focusId}`)?.focus();
  }, [focusId, opt]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return opt.filter(
      (x) =>
        (!needle || `${x.title} ${x.company}`.toLowerCase().includes(needle)) &&
        (!type || x.type === type) &&
        (!minScore || (x.score ?? 0) >= minScore),
    );
  }, [opt, q, type, minScore]);
  const filtering = !!(q || type || minScore);

  const switchView = (v: "board" | "table") => {
    setView(v);
    const u = new URL(window.location.href);
    if (v === "table") u.searchParams.set("view", "table");
    else u.searchParams.delete("view");
    window.history.replaceState(null, "", u);
  };

  const doMove = (item: BoardItem, to: AppState) => {
    setFocusId(item.id);
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
    return (
      <li
        key={item.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", String(item.id));
          e.dataTransfer.effectAllowed = "move";
        }}
        className={`card card-hover group p-3 ${grabbed ? "outline-2 outline-offset-2 outline-accent" : ""}`}
        style={grabbed ? { outlineStyle: "solid" } : undefined}
      >
        <div className="flex items-start gap-2.5">
          <CompanyAvatar name={item.company} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-muted">{item.company}</p>
            <Link href={`/app/pipeline/${item.id}`} className="line-clamp-2 text-sm font-semibold leading-snug hover:text-accent-text">
              {item.title}
            </Link>
          </div>
          {item.score !== null && <ScoreRing value={item.score} size={34} label={scoreLabel(t, item.score)} animate={false} />}
        </div>
        <ul className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-label={b.details}>
          <li className="inline-flex items-center gap-1 tabular" title={fmt(b.daysInStage, { n: item.stageDays })}>
            <Clock size={12} aria-hidden="true" />
            <span aria-hidden="true">{fmt(b.daysShort, { n: item.stageDays })}</span>
            <span className="sr-only">{fmt(b.daysInStage, { n: item.stageDays })}</span>
          </li>
          {item.next_action_at && (
            <li className={`inline-flex items-center gap-1 ${item.overdue ? "font-semibold text-danger" : ""}`}>
              <CalendarClock size={12} aria-hidden="true" />
              {item.overdue && <span className="sr-only">{b.overdue}: </span>}
              {shortDate(item.next_action_at, locale)}
            </li>
          )}
          {item.interviewAt && (
            <li className="chip chip-saffron !py-0 text-[0.7rem]">
              <Mic size={11} aria-hidden="true" /> {fmt(b.interviewOn, { date: shortDate(item.interviewAt, locale) })}
            </li>
          )}
          {item.contacts > 0 && (
            <li className="inline-flex items-center gap-1">
              <Users size={12} aria-hidden="true" />
              <span aria-hidden="true">{item.contacts}</span>
              <span className="sr-only">{fmt(b.contacts, { n: item.contacts })}</span>
            </li>
          )}
        </ul>
        <div className="mt-2.5 flex items-center gap-1.5">
          <button
            id={`grab-${item.id}`}
            type="button"
            className="btn btn-ghost btn-icon btn-sm cursor-grab"
            aria-label={fmt(b.grab, { title: `${item.company} — ${item.title}` })}
            aria-describedby="dnd-help"
            aria-pressed={grabbed}
            onKeyDown={(e) => onHandleKey(e, item)}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
          <label className="sr-only" htmlFor={`mv-${item.id}`}>{fmt(b.moveLabel, { title: `${item.company} — ${item.title}` })}</label>
          <select id={`mv-${item.id}`} className="input !h-8 !min-h-0 !py-0 !px-2 text-xs flex-1" value={item.status} onChange={(e) => doMove(item, e.target.value as AppState)}>
            {APP_STATES.map((s) => (
              <option key={s} value={s}>{t.states[s]}</option>
            ))}
          </select>
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
        className={`flex min-h-24 flex-col rounded-2xl border p-2 transition-colors ${hot ? "border-accent bg-accent-soft" : "border-line bg-surface-2"} ${compact ? "" : "w-[276px] shrink-0 snap-start"}`}
      >
        <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
          <h2 id={`col-${state}`} className="flex items-center gap-2 text-sm font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
            <StateDot state={state} />
            {t.states[state]}
          </h2>
          <span className="mono text-xs text-muted">
            <span aria-hidden="true">{col.length}</span>
            <span className="sr-only">{fmt(t.pipeline.count, { n: col.length })}</span>
          </span>
        </header>
        {col.length ? (
          <ul className="space-y-2">{col.map(card)}</ul>
        ) : (
          <p className="grid flex-1 place-items-center rounded-xl border border-dashed border-line px-3 py-5 text-center text-xs text-muted">{b.emptyCol}</p>
        )}
      </section>
    );
  };

  const closedCount = filtered.filter((x) => CLOSED.includes(x.status)).length;

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

      <div className="mb-4 flex flex-wrap items-end gap-3 rise" style={{ ["--i" as string]: 2 }}>
        <div className="relative min-w-0 flex-1 basis-56">
          <label htmlFor="pf-q" className="sr-only">{t.common.search}</label>
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input id="pf-q" type="search" className="input !pl-9" placeholder={b.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pf-type" className="sr-only">{t.jobs.type}</label>
          <select id="pf-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{b.allTypes}</option>
            {JOB_TYPES.map((k) => (
              <option key={k} value={k}>{t.jobTypes[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pf-score" className="sr-only">{b.minScore}</label>
          <select id="pf-score" className="input" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
            <option value={0}>{b.anyScore}</option>
            {[3, 3.5, 4, 4.5].map((s) => (
              <option key={s} value={s}>{fmt(b.scoreAtLeast, { n: s.toFixed(1) })}</option>
            ))}
          </select>
        </div>
        <div role="group" aria-label={b.viewLabel} className="inline-flex overflow-hidden rounded-full border border-line-strong">
          {(["board", "table"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => switchView(v)} className={`btn btn-sm rounded-none ${view === v ? "bg-surface-3 text-ink" : "btn-ghost"}`}>
              {v === "board" ? <Kanban size={14} aria-hidden="true" /> : <Table2 size={14} aria-hidden="true" />}
              {v === "board" ? b.viewBoard : b.viewTable}
            </button>
          ))}
        </div>
      </div>

      {filtering && filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-ink-2">{b.noMatch}</p>
          <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={() => { setQ(""); setType(""); setMinScore(0); }}>{b.clearFilters}</button>
        </div>
      ) : view === "board" ? (
        <div className="-mx-4 flex snap-x items-start gap-3 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8 rise" style={{ ["--i" as string]: 3 }} aria-label={t.pipeline.board} role="region" tabIndex={0}>
          {ACTIVE.map((s) => column(s))}
          <div className={`shrink-0 rounded-2xl border border-line bg-surface p-2 ${showClosed ? "w-[292px]" : "w-[180px]"}`}>
            <button type="button" className="btn btn-ghost btn-sm w-full justify-between" aria-expanded={showClosed} onClick={() => setShowClosed((v) => !v)}>
              <span className="inline-flex items-center gap-1.5">
                {showClosed ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                {b.closed}
              </span>
              <span className="mono text-xs text-muted">{closedCount}</span>
            </button>
            {showClosed ? (
              <div className="mt-2 space-y-2">{CLOSED.map((s) => column(s, true))}</div>
            ) : (
              <div className="mt-2 space-y-2">
                {CLOSED.map((s) => (
                  <div key={s} {...dropProps(s)} className={`rounded-xl border border-dashed px-3 py-3 text-xs transition-colors ${dragOver === s || grab?.target === s ? "border-accent bg-accent-soft text-ink" : "border-line text-muted"}`}>
                    <span className="flex items-center justify-between">
                      {t.states[s]} <span className="mono">{filtered.filter((x) => x.status === s).length}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto rise" style={{ ["--i" as string]: 3 }}>
          <table className="table min-w-[720px]">
            <caption className="sr-only">{t.pipeline.title}</caption>
            <thead>
              <tr>
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
                    <div className="flex items-center gap-2.5">
                      <CompanyAvatar name={x.company} size={28} />
                      <div className="min-w-0">
                        <Link href={`/app/pipeline/${x.id}`} className="font-semibold hover:text-accent-text">{x.title}</Link>
                        <p className="text-xs text-muted">{x.company}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <StateChip state={x.status} t={t} />
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
    </>
  );
}

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
function StateDot({ state }: { state: AppState }) {
  return <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: DOT[state] }} />;
}
