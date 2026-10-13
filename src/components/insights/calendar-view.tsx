"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, List, Plus, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { addReminderAction, setReminderDoneAction } from "@/app/actions/insights";
import type { CalItem, CalKind } from "@/lib/repo/insights";

const KIND_COLOR: Record<CalKind, string> = {
  interview: "var(--saffron)",
  reminder: "var(--accent)",
  deadline: "var(--danger)",
  applied: "var(--success)",
};
const KIND_SOFT: Record<CalKind, string> = {
  interview: "bg-saffron-soft text-saffron",
  reminder: "bg-accent-soft text-accent-text",
  deadline: "bg-danger-soft text-danger",
  applied: "bg-success-soft text-success",
};

export function CalendarView({
  month,
  monthLabel,
  grid,
  items,
  today,
  prevHref,
  nextHref,
  targets,
}: {
  month: string;
  monthLabel: string;
  grid: { key: string; inMonth: boolean }[];
  items: CalItem[];
  today: string;
  prevHref: string;
  nextHref: string;
  targets: { id: number; label: string }[];
}) {
  const { t, locale } = useT();
  const m = t.insights2.cal;
  const router = useRouter();
  const toast = useToast();
  const loc = locale === "fr" ? "fr-FR" : "en-GB";
  const initial = today.startsWith(month) ? today : `${month}-01`;
  const [selected, setSelected] = useState(initial);
  const [focused, setFocused] = useState(initial);
  const [view, setView] = useState<"month" | "agenda">("month");
  const [doneOverride, setDoneOverride] = useState<Record<number, boolean>>({});
  const [pending, start] = useTransition();
  const cells = useRef(new Map<string, HTMLTableCellElement>());
  const formRef = useRef<HTMLFormElement>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const it of items) map.set(it.day, [...(map.get(it.day) ?? []), it]);
    return map;
  }, [items]);

  const longDay = (key: string) => {
    const [y, mo, d] = key.split("-").map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" });
  };
  const isDone = (it: CalItem) => (it.reminderId !== undefined && it.reminderId in doneOverride ? doneOverride[it.reminderId] : !!it.done);

  const moveFocus = (key: string) => {
    setFocused(key);
    cells.current.get(key)?.focus();
  };

  const onKey = (e: React.KeyboardEvent, idx: number) => {
    const col = idx % 7;
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -col, End: 6 - col };
    if (e.key in delta) {
      e.preventDefault();
      const n = idx + delta[e.key];
      if (n < 0) router.push(prevHref);
      else if (n > 41) router.push(nextHref);
      else moveFocus(grid[n].key);
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      router.push(e.key === "PageUp" ? prevHref : nextHref);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected(grid[idx].key);
    }
  };

  const toggle = (it: CalItem) => {
    const id = it.reminderId!;
    const next = !isDone(it);
    setDoneOverride((o) => ({ ...o, [id]: next }));
    start(async () => {
      await setReminderDoneAction(id, next);
      toast.success(next ? m.doneToast : m.undoneToast);
    });
  };

  const itemRow = (it: CalItem) => {
    const done = isDone(it);
    return (
      <li key={it.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3">
        <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ background: KIND_COLOR[it.kind] }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">
            <span className={`chip !py-0 ${KIND_SOFT[it.kind]}`}>{m.kinds[it.kind]}</span>
            {it.time && <span className="mono ml-2 text-muted">{it.time}</span>}
          </p>
          <p className={`mt-1 text-sm font-medium ${done ? "text-muted line-through" : ""}`}>
            {it.href ? <Link href={it.href} className="hover:text-accent-text">{it.title}</Link> : it.title}
          </p>
          {it.sub && <p className="truncate text-xs text-muted">{it.sub}</p>}
        </div>
        {it.reminderId !== undefined && (
          <button
            type="button"
            className={`btn btn-sm btn-icon ${done ? "btn-secondary" : "btn-ghost"}`}
            aria-pressed={done}
            aria-label={`${done ? m.markUndone : m.markDone}: ${it.title}`}
            title={done ? m.markUndone : m.markDone}
            onClick={() => toggle(it)}
            disabled={pending}
          >
            {done ? <RotateCcw size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
          </button>
        )}
      </li>
    );
  };

  const dayItems = byDay.get(selected) ?? [];
  const agendaDays = grid.filter((g) => g.inMonth && byDay.has(g.key));

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 rise" style={{ ["--i" as string]: 1 }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label={m.view} className="inline-flex rounded-xl border border-line bg-surface p-0.5">
            {(["month", "agenda"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium transition-colors ${view === v ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"}`}
              >
                {v === "month" ? <CalendarDays size={15} aria-hidden="true" /> : <List size={15} aria-hidden="true" />}
                {m[v]}
              </button>
            ))}
          </div>
          <ul aria-label={m.legend} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {(Object.keys(KIND_COLOR) as CalKind[]).map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} aria-hidden="true" />
                {m.kinds[k]}
              </li>
            ))}
          </ul>
        </div>

        {view === "month" ? (
          <div className="card overflow-hidden">
            <p id="cal-hint" className="sr-only">{m.gridHint}</p>
            <table role="grid" aria-label={monthLabel} aria-describedby="cal-hint" className="w-full table-fixed border-collapse">
              <thead>
                <tr>
                  {m.weekdays.map((w, i) => (
                    <th key={w} scope="col" abbr={m.weekdaysLong[i]} className="border-b border-line py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }, (_, r) => (
                  <tr key={r}>
                    {grid.slice(r * 7, r * 7 + 7).map((g, c) => {
                      const idx = r * 7 + c;
                      const list = byDay.get(g.key) ?? [];
                      const isToday = g.key === today;
                      const isSel = g.key === selected;
                      return (
                        <td
                          key={g.key}
                          ref={(el) => {
                            if (el) cells.current.set(g.key, el);
                            else cells.current.delete(g.key);
                          }}
                          role="gridcell"
                          tabIndex={g.key === focused ? 0 : -1}
                          aria-selected={isSel}
                          aria-current={isToday ? "date" : undefined}
                          aria-label={`${longDay(g.key)}${list.length ? `, ${list.length === 1 ? m.oneItem : fmt(m.nItems, { n: list.length })}` : ""}`}
                          onClick={() => {
                            setSelected(g.key);
                            setFocused(g.key);
                          }}
                          onKeyDown={(e) => onKey(e, idx)}
                          onFocus={() => setFocused(g.key)}
                          className={`h-16 cursor-pointer border-b border-r border-line p-1 align-top outline-none transition-colors last:border-r-0 focus-visible:relative focus-visible:z-10 focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] sm:h-24 sm:p-1.5 ${
                            isSel ? "bg-accent-soft/60" : g.inMonth ? "hover:bg-surface-2" : "bg-surface-2/40 hover:bg-surface-2"
                          }`}
                        >
                          <div aria-hidden="true">
                            <span
                              className={`inline-grid size-6 place-items-center rounded-full text-xs tabular ${
                                isToday ? "bg-accent font-semibold text-[var(--accent-ink)]" : g.inMonth ? "text-ink" : "text-muted"
                              }`}
                            >
                              {Number(g.key.slice(8))}
                            </span>
                            {list.length > 0 && (
                              <>
                                <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                                  {list.slice(0, 4).map((it) => (
                                    <span key={it.id} className="size-1.5 rounded-full" style={{ background: KIND_COLOR[it.kind], opacity: isDone(it) ? 0.4 : 1 }} />
                                  ))}
                                </span>
                                <span className="mt-0.5 hidden space-y-0.5 sm:block">
                                  {list.slice(0, 2).map((it) => (
                                    <span
                                      key={it.id}
                                      className={`block truncate rounded px-1 text-[0.68rem] leading-4 ${KIND_SOFT[it.kind]} ${isDone(it) ? "line-through opacity-60" : ""}`}
                                    >
                                      {it.time && <span className="mono">{it.time} </span>}
                                      {it.title}
                                    </span>
                                  ))}
                                  {list.length > 2 && <span className="block px-1 text-[0.68rem] text-muted">+{list.length - 2}</span>}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : agendaDays.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted">{m.agendaEmpty}</div>
        ) : (
          <ol className="space-y-5">
            {agendaDays.map((g) => (
              <li key={g.key}>
                <h3 className={`mb-2 text-sm font-semibold capitalize ${g.key < today ? "text-muted" : ""}`} style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
                  {longDay(g.key)}
                  {g.key === today && <span className="chip chip-accent ml-2 normal-case">{m.today}</span>}
                </h3>
                <ul className="space-y-2">{byDay.get(g.key)!.map(itemRow)}</ul>
              </li>
            ))}
          </ol>
        )}
        {items.length === 0 && view === "month" && (
          <p className="mt-3 text-sm text-muted">
            <strong className="font-medium text-ink-2">{m.emptyTitle}.</strong> {m.emptyHint}
          </p>
        )}
      </div>

      <aside className="card p-5 rise lg:sticky lg:top-20" style={{ ["--i" as string]: 2 }} aria-labelledby="day-h">
        <p className="text-xs font-medium text-muted">{m.selectedDay}</p>
        <h2 id="day-h" className="text-lg capitalize" aria-live="polite">{longDay(selected)}</h2>
        {dayItems.length === 0 ? <p className="mt-2 text-sm text-muted">{m.noItems}</p> : <ul className="mt-3 space-y-2">{dayItems.map(itemRow)}</ul>}

        <form
          ref={formRef}
          className="mt-5 space-y-3 border-t border-line pt-4"
          action={(fd) =>
            start(async () => {
              const r = await addReminderAction(fd);
              if (r.ok) {
                toast.success(m.added);
                formRef.current?.reset();
              } else toast.error(t.common.error, r.error === "title" ? m.reminderTitle : m.reminderDate);
            })
          }
        >
          <h3 className="flex items-center gap-1.5 text-sm font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
            <Plus size={15} aria-hidden="true" /> {m.addReminder}
          </h3>
          <div>
            <label htmlFor="rem-title" className="label">{m.reminderTitle}</label>
            <input id="rem-title" name="title" required maxLength={200} className="input" placeholder={m.reminderTitlePh} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="rem-date" className="label">{m.reminderDate}</label>
              <input id="rem-date" key={selected} name="date" type="date" required defaultValue={selected} className="input" />
            </div>
            <div>
              <label htmlFor="rem-time" className="label">{m.reminderTime}</label>
              <input id="rem-time" name="time" type="time" className="input" />
            </div>
          </div>
          {targets.length > 0 && (
            <div>
              <label htmlFor="rem-job" className="label">{m.reminderOffer}</label>
              <select id="rem-job" name="job_id" className="input" defaultValue="">
                <option value="">{m.noOffer}</option>
                {targets.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={pending} aria-busy={pending}>{m.save}</button>
        </form>
      </aside>
    </div>
  );
}
