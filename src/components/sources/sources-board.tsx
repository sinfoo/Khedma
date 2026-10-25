"use client";

import { useState, useTransition } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import { CompanyAvatar, Section } from "@/components/kit";
import { useToast } from "@/components/kit/toast";
import { Dialog } from "@/components/kit/dialog";
import { Menu, MenuItem } from "@/components/kit/menu";
import { Switch, ToggleBox } from "@/components/toggle-box";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { CATALOG } from "@/lib/sources/catalog";
import { loadSuggestedSources, removeSource, setAutoScan, updateSourceSettings } from "@/app/actions/sources";
import type { ScanRun, SourceRow } from "@/lib/repo/sources";
import { errorReason } from "./error-reason";

const HOURS = [1, 3, 6, 12, 24];

/** Per saved source id: scans that read it over the last 5, and the new offers it kept. */
export type Yields = Record<number, { runs: number; kept: number }>;

/** "3 kept over the last 5 scans", with a hint to remove a source that keeps nothing scan after scan. */
export function YieldNote({ y }: { y?: Yields[number] }) {
  const { t } = useT();
  const m = t.sources2.scan2;
  if (!y?.runs) return null;
  const dead = y.kept === 0 && y.runs >= 3;
  return (
    <p className={`truncate text-[0.72rem] ${dead ? "font-semibold text-saffron" : "text-muted"}`}>
      {y.kept ? fmt(m.yieldN, { n: y.kept, runs: y.runs }) : fmt(m.yieldNone, { runs: y.runs })}
      {dead && ` · ${m.yieldDead}`}
    </p>
  );
}

// Relative times depend on the clock: elements showing them use suppressHydrationWarning.
export function ago(iso: string | null, locale: string, never: string): string {
  if (!iso) return never;
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const a = Math.abs(s);
  if (a < 60) return rtf.format(Math.round(s), "second");
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86_400), "day");
}

/** "Your sources": calm, secondary. Two columns, one switch per source, auto-scan in the header. */
export function SourcesList({ sources, auto, yields }: { sources: SourceRow[]; auto: { enabled: boolean; hours: number }; yields: Yields }) {
  const { t, locale } = useT();
  const s2 = t.sources2;
  const m = s2.scan2;
  const toast = useToast();
  const [editing, setEditing] = useState<SourceRow | null>(null);
  const [autoState, setAutoState] = useState(auto);
  const [pending, start] = useTransition();
  const saveAuto = (next: { enabled: boolean; hours: number }) => {
    setAutoState(next);
    start(async () => {
      await setAutoScan(next.enabled, next.hours);
      toast.success(s2.auto.saved);
    });
  };

  return (
    <section className="card mt-5 overflow-hidden" aria-labelledby="yours-h">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-[18px] py-3.5">
        <h2 id="yours-h" className="card-title">{m.yours}</h2>
        <div className="flex items-center gap-3 text-[0.8rem] text-muted">
          <label className="inline-flex items-center gap-1.5">
            <span>{autoState.enabled ? m.autoEvery.split("{n}")[0] : m.autoOff}</span>
            {autoState.enabled && (
              <>
                <select className="input !h-7 !w-auto !py-0 text-[0.78rem]" aria-label={s2.auto.every} value={autoState.hours} onChange={(e) => saveAuto({ ...autoState, hours: Number(e.target.value) })}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <span>{m.autoEvery.split("{n}")[1]}</span>
              </>
            )}
          </label>
          <Switch checked={autoState.enabled} label={s2.auto.label} disabled={pending} onChange={(v) => saveAuto({ ...autoState, enabled: v })} />
        </div>
      </div>
      {sources.length === 0 ? (
        <div className="px-[18px] py-8 text-center">
          <p className="font-semibold">{s2.yoursEmpty}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{s2.yoursEmptyHint}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => start(() => loadSuggestedSources("tn"))}>
              {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {s2.addTunisian}
            </button>
            <button type="button" className="btn btn-outline" disabled={pending} onClick={() => start(() => loadSuggestedSources("all"))}>
              {s2.addAll}
            </button>
          </div>
        </div>
      ) : (
        <ul className="grid md:grid-cols-2">
          {sources.map((s) => {
            const entry = CATALOG.find((c) => c.kind === s.kind);
            const option = entry?.handle.type === "select" ? entry.handle.options.find((o) => o.value === s.handle) : undefined;
            const handleText = entry?.handle.type === "select" ? (s.handle ? option?.label ?? s.handle : s2.allOffers) : s.handle;
            const state = !s.enabled ? "paused" : s.last_error ? "error" : "idle";
            const color = state === "error" ? "var(--danger)" : state === "paused" ? "var(--muted)" : "var(--success)";
            return (
              <li key={s.id} className="flex min-w-0 items-center gap-3 border-b border-line px-[18px] py-3 md:[&:nth-child(odd)]:border-r" style={{ opacity: s.enabled ? 1 : 0.6 }}>
                <CompanyAvatar name={entry?.name ?? s.kind} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {s.label}
                    {entry?.country === "TN" && <span className="rounded-[5px] bg-accent-soft px-1.5 text-[0.65rem] font-bold text-accent-text">TN</span>}
                    {s.keep_all && <span className="chip chip-saffron !py-0 text-[0.65rem]">{s2.keepAllOn}</span>}
                  </p>
                  <p className="truncate text-[0.75rem] text-muted" suppressHydrationWarning>
                    {entry?.name ?? s.kind}
                    {handleText ? ` · ${handleText}` : ""} · {s.last_scan ? fmt(s2.lastScanAgo, { when: ago(s.last_scan, locale, s2.stats.never) }) : s2.neverScanned}
                    {state === "error" && <span className="text-danger"> · {errorReason(t, s.last_error)}</span>}
                  </p>
                  <YieldNote y={yields[s.id]} />
                </div>
                <span className="status hidden whitespace-nowrap text-[0.75rem] sm:inline-flex" style={{ color }}>{m.state[state]}</span>
                <ToggleBox id={s.id} enabled={s.enabled} label={fmt(s2.enableX, { label: s.label })} />
                <Menu label={fmt(s2.actions, { label: s.label })} trigger={<MoreHorizontal size={16} aria-hidden="true" />}>
                  <MenuItem onClick={() => setEditing(s)}>{s2.edit}</MenuItem>
                  {entry?.site && <MenuItem href={entry.site}>{fmt(s2.visit, { name: entry.name })}</MenuItem>}
                  <MenuItem
                    danger
                    onClick={() => {
                      if (!window.confirm(s2.removeConfirm)) return;
                      start(async () => {
                        await removeSource(s.id);
                        toast.success(s2.removed, s.label);
                      });
                    }}
                  >
                    {s2.remove}
                  </MenuItem>
                </Menu>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <EditDialog source={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

export function History({ runs }: { runs: ScanRun[] }) {
  const { t, locale } = useT();
  const s2 = t.sources2;
  if (!runs.length) return null;
  return (
    <Section id="history" title={s2.history} i={5} className="!p-0 overflow-hidden [&>div]:px-[18px] [&>div]:pt-3.5">
      <p id="history-cols" className="px-[18px] pb-3 text-[0.75rem] text-muted">{s2.historyCols}</p>
      <div className="overflow-x-auto border-t border-line">
        <table className="table min-w-[560px]" aria-describedby="history-cols">
          <thead>
            <tr>
              <th scope="col">{s2.col.when}</th>
              <th scope="col">{s2.col.trigger}</th>
              <th scope="col" className="text-right">{s2.col.sources}</th>
              <th scope="col" className="text-right">{s2.col.listed}</th>
              <th scope="col" className="text-right">{s2.col.added}</th>
              <th scope="col" className="text-right">{s2.col.dupes}</th>
              <th scope="col" className="text-right">{s2.col.errors}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap" suppressHydrationWarning>
                  {new Date(r.started_at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  <span className="ml-1.5 text-[0.75rem] text-muted">{ago(r.started_at, locale, "—")}</span>
                </td>
                <td>
                  <span className={`chip !py-0 text-[0.72rem] ${r.trigger === "auto" ? "chip-accent" : ""}`}>{s2.trigger[r.trigger]}</span>
                </td>
                <td className="tabular text-right">{r.sources}</td>
                <td className="tabular text-right">{r.listed}</td>
                <td className={`tabular text-right ${r.added ? "font-semibold text-success" : ""}`}>{r.added}</td>
                <td className="tabular text-right text-muted">{r.duplicates}</td>
                <td className={`tabular text-right ${r.errors ? "text-danger" : "text-muted"}`}>{r.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function EditDialog({ source, onClose }: { source: SourceRow; onClose: () => void }) {
  const { t } = useT();
  const s2 = t.sources2;
  const toast = useToast();
  const entry = CATALOG.find((c) => c.kind === source.kind);
  const [label, setLabel] = useState(source.label);
  const [keywords, setKeywords] = useState(source.keywords.join(", "));
  const [keepAll, setKeepAll] = useState(source.keep_all);
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      await updateSourceSettings(source.id, { label, keywords, keep_all: keepAll });
      toast.success(s2.saved, label);
      onClose();
    });
  return (
    <Dialog
      open
      onClose={onClose}
      title={fmt(s2.editTitle, { label: source.label })}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="submit" form="edit-source" className="btn btn-primary" disabled={pending} aria-busy={pending}>
            {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {t.common.save}
          </button>
        </>
      }
    >
      <form
        id="edit-source"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div>
          <label className="label" htmlFor="edit-label">{s2.label}</label>
          <input id="edit-label" className="input" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="edit-kw">{s2.keywordsField}</label>
          <input id="edit-kw" className="input" value={keywords} placeholder="stage, pfe, développeur" aria-describedby="edit-kw-hint" onChange={(e) => setKeywords(e.target.value)} />
          <p id="edit-kw-hint" className="hint">{entry?.keywords ? s2.keywordsHint : s2.keywordsHintLocal}</p>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl border border-line p-3">
          <div>
            <label htmlFor="edit-keepall" className="text-sm font-semibold">{s2.keepAll}</label>
            <p id="edit-keepall-hint" className="hint !mt-0.5">{s2.keepAllHint}</p>
          </div>
          <Switch id="edit-keepall" checked={keepAll} onChange={setKeepAll} describedBy="edit-keepall-hint" />
        </div>
      </form>
    </Dialog>
  );
}
