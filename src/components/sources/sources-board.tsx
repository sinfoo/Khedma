"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, MoreHorizontal, RefreshCw, Rss, Sparkles } from "lucide-react";
import { CompanyAvatar, EmptyState, Progress, Section } from "@/components/kit";
import { useToast } from "@/components/kit/toast";
import { Dialog } from "@/components/kit/dialog";
import { Menu, MenuItem } from "@/components/kit/menu";
import { Switch, ToggleBox } from "@/components/toggle-box";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { CATALOG } from "@/lib/sources/catalog";
import { loadSuggestedSources, removeSource, setAutoScan, updateSourceSettings } from "@/app/actions/sources";
import type { Discovered, ScanRun, SourceRow } from "@/lib/repo/sources";
import type { JobType } from "@/lib/types";
import { Catalog } from "./catalog";
import { useAutoScan, useScan, type ScanDone, type SourceStatus } from "./use-scan";

const HOURS = [1, 3, 6, 12, 24];

/** "{n} new" with the locale's plural rule (FR: 0 and 1 are singular). */
const plural = (locale: string, n: number, one: string, many: string) => fmt(new Intl.PluralRules(locale).select(n) === "one" ? one : many, { n });

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

export function SourcesBoard({
  sources,
  discovered,
  runs,
  auto,
  profileKeywords,
  autoStart,
}: {
  sources: SourceRow[];
  discovered: Discovered[];
  runs: ScanRun[];
  auto: { enabled: boolean; hours: number };
  profileKeywords: string[];
  autoStart: boolean;
}) {
  const { t, locale } = useT();
  const s2 = t.sources2;
  const router = useRouter();
  const toast = useToast();
  const { start, running, status, total, finished } = useScan();
  const [pending, startTransition] = useTransition();
  const enabled = sources.filter((s) => s.enabled);

  const report = (done: ScanDone, trigger: "manual" | "auto") => {
    const title = trigger === "auto" ? fmt(s2.auto.ran, { n: done.added }) : done.added === 0 ? s2.summaryNone : done.added === 1 ? s2.summaryOne : fmt(s2.summary, { n: done.added });
    const body = fmt(s2.summaryBody, { dupes: done.duplicates, errors: done.errors });
    if (done.added > 0) toast.success(title, body, { label: s2.view, onClick: () => router.push(done.added === 1 ? `/app/jobs/${done.jobs[0].id}` : "/app/jobs") });
    else if (trigger === "manual") toast.info(title, body);
    router.refresh();
  };

  const scan = async (ids?: number[]) => {
    const r = await start({ ids });
    if (r.kind === "done") report(r.done, "manual");
    else if (r.kind === "busy") toast.info(s2.busy);
    else if (r.kind === "error") toast.error(s2.scanFailed, r.error);
  };

  useAutoScan(start, (done) => report(done, "auto"));

  // ?scan=1 (command palette) starts a full scan once, then cleans the URL.
  const kicked = useRef(false);
  useEffect(() => {
    if (!autoStart || kicked.current) return;
    kicked.current = true;
    router.replace("/app/sources", { scroll: false });
    if (enabled.length) void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const lastRun = runs[0];
  const [editing, setEditing] = useState<SourceRow | null>(null);

  return (
    <div className="space-y-8">
      {/* Summary strip + primary action */}
      <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-stretch">
        <SummaryTile i={1} label={s2.stats.active} value={`${enabled.length}`} sub={sources.length > enabled.length ? `/ ${sources.length}` : undefined} />
        <SummaryTile i={2} label={s2.stats.lastScan} value={lastRun ? ago(lastRun.started_at, locale, s2.stats.never) : s2.stats.never} small />
        <SummaryTile i={3} label={s2.stats.lastAdded} value={lastRun ? `${lastRun.added}` : "—"} />
        <div className="card rise flex items-center p-3" style={{ ["--i" as string]: 4 }}>
          <button type="button" className="btn btn-primary btn-lg w-full" disabled={running || !enabled.length} aria-busy={running} onClick={() => scan()}>
            {running ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={18} aria-hidden="true" />}
            {running ? s2.scanning : s2.scanAll}
          </button>
        </div>
      </div>

      {running && total > 0 && (
        <div className="card p-4 fade" role="status" aria-live="polite">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{fmt(s2.progress, { done: finished, total })}</span>
            <span className="tabular text-muted">{Math.round((finished / total) * 100)}%</span>
          </div>
          <Progress value={finished} max={total} label={fmt(s2.progress, { done: finished, total })} />
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {sources.length === 0 ? (
            <EmptyState icon={<Rss size={22} aria-hidden="true" />} title={s2.yoursEmpty} hint={s2.yoursEmptyHint}>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={() => startTransition(() => loadSuggestedSources("tn"))}>
                {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {s2.addTunisian}
              </button>
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => startTransition(() => loadSuggestedSources("all"))}>
                {s2.addAll}
              </button>
            </EmptyState>
          ) : (
            <Section id="yours" title={s2.yours} i={2}>
              <ul className="-mx-5 -mb-5 divide-y divide-line border-t border-line">
                {sources.map((s) => (
                  <SourceItem
                    key={s.id}
                    source={s}
                    status={status[s.id]}
                    running={running}
                    profileKeywords={profileKeywords}
                    onScan={() => scan([s.id])}
                    onEdit={() => setEditing(s)}
                  />
                ))}
              </ul>
            </Section>
          )}

          <History runs={runs} />
        </div>

        <aside className="space-y-6">
          <DiscoveredList items={discovered} />
          <AutoScanCard auto={auto} lastRunAt={lastRun?.started_at ?? null} />
          <p className="px-1 text-xs leading-relaxed text-muted">{s2.respect}</p>
        </aside>
      </div>

      <Catalog
        existing={sources.map((s) => `${s.kind}:${s.handle}`)}
        onAdded={(id, name) => toast.success(s2.added, name, { label: s2.scanNow, onClick: () => void scan([id]) })}
      />

      {editing && <EditDialog source={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SummaryTile({ label, value, sub, small, i }: { label: string; value: string; sub?: string; small?: boolean; i: number }) {
  return (
    <div className="card rise p-4" style={{ ["--i" as string]: i }}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 display leading-none ${small ? "text-xl" : "text-3xl tabular"}`} suppressHydrationWarning>
        {value}
        {sub && <span className="ml-1 text-base text-muted">{sub}</span>}
      </p>
    </div>
  );
}

function SourceItem({
  source: s,
  status,
  running,
  profileKeywords,
  onScan,
  onEdit,
}: {
  source: SourceRow;
  status?: SourceStatus;
  running: boolean;
  profileKeywords: string[];
  onScan: () => void;
  onEdit: () => void;
}) {
  const { t, locale } = useT();
  const s2 = t.sources2;
  const toast = useToast();
  const [, startTransition] = useTransition();
  const entry = CATALOG.find((c) => c.kind === s.kind);
  const option = entry?.handle.type === "select" ? entry.handle.options.find((o) => o.value === s.handle) : undefined;
  const handleText = entry?.handle.type === "select" ? (s.handle ? option?.label ?? s.handle : s2.allOffers) : s.handle;
  const error = status?.state === "error" ? status.error : status ? undefined : s.last_error;
  const kw = s.keywords.length ? s.keywords : entry?.keywords ? profileKeywords : [];

  return (
    <li className={`flex flex-wrap items-start gap-x-3 gap-y-2 px-5 py-4 ${s.enabled ? "" : "opacity-70"}`}>
      <CompanyAvatar name={entry?.name ?? s.kind} size={36} />
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-semibold">{s.label}</p>
          {entry?.country === "TN" && <span className="chip chip-accent !py-0 text-[0.7rem]">TN</span>}
          {s.keep_all && <span className="chip chip-saffron !py-0 text-[0.7rem]">{s2.keepAllOn}</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          <span>{entry?.name ?? s.kind}</span>
          {handleText && (
            <>
              {" · "}
              <span className="mono">{handleText}</span>
            </>
          )}
        </p>
        {entry?.keywords && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted">
            <span className="sr-only">{s2.keywords}: </span>
            {kw.length ? (
              s.keywords.length ? (
                kw.map((k) => (
                  <span key={k} className="chip !py-0 text-[0.72rem]">
                    {k}
                  </span>
                ))
              ) : (
                fmt(s2.profileKeywords, { k: kw.join(", ") })
              )
            ) : (
              s2.noKeywords
            )}
          </p>
        )}
        <p className="mt-1.5 text-xs text-muted tabular" aria-live="polite" suppressHydrationWarning>
          <StatusLine source={s} status={status} locale={locale} />
        </p>
        {error && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            <AlertTriangle size={14} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1 break-words">{error}</span>
            <button type="button" className="btn btn-sm btn-secondary !min-h-7" disabled={running} onClick={onScan}>
              {s2.retry}
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 self-center">
        <button type="button" className="btn btn-ghost btn-sm" disabled={running || !s.enabled} onClick={onScan} aria-label={`${s2.scanNow}: ${s.label}`}>
          {status?.state === "running" ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
          <span className="hidden sm:inline">{s2.scanNow}</span>
        </button>
        <ToggleBox id={s.id} enabled={s.enabled} label={fmt(s2.enableX, { label: s.label })} />
        <Menu label={fmt(s2.actions, { label: s.label })} trigger={<MoreHorizontal size={16} aria-hidden="true" />}>
          <MenuItem onClick={onEdit}>{s2.edit}</MenuItem>
          {entry?.site && <MenuItem href={entry.site}>{fmt(s2.visit, { name: entry.name })}</MenuItem>}
          <MenuItem
            danger
            onClick={() => {
              if (!window.confirm(s2.removeConfirm)) return;
              startTransition(async () => {
                await removeSource(s.id);
                toast.success(s2.removed, s.label);
              });
            }}
          >
            {s2.remove}
          </MenuItem>
        </Menu>
      </div>
    </li>
  );
}

function StatusLine({ source: s, status, locale }: { source: SourceRow; status?: SourceStatus; locale: string }) {
  const { t } = useT();
  const s2 = t.sources2;
  if (status?.state === "queued")
    return (
      <span className="inline-flex items-center gap-1">
        <Clock3 size={12} aria-hidden="true" /> {s2.statusQueued}
      </span>
    );
  if (status?.state === "running")
    return (
      <span className="inline-flex items-center gap-1 text-accent-text">
        <Loader2 size={12} className="animate-spin" aria-hidden="true" /> {s2.statusRunning}
      </span>
    );
  if (status?.state === "done")
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <CheckCircle2 size={12} aria-hidden="true" /> +{plural(locale, status.added ?? 0, s2.newCountOne, s2.newCount)} · {plural(locale, status.listed ?? 0, s2.listedCountOne, s2.listedCount)}
      </span>
    );
  if (!s.last_scan) return <>{s2.neverScanned}</>;
  return (
    <>
      {fmt(s2.lastScanAgo, { when: ago(s.last_scan, locale, s2.stats.never) })} ·{" "}
      <span className={s.last_count ? "font-semibold text-success" : ""}>{plural(locale, s.last_count, s2.newCountOne, s2.newCount)}</span>
      {s.last_total > 0 && <> · {plural(locale, s.last_total, s2.listedCountOne, s2.listedCount)}</>}
    </>
  );
}

function DiscoveredList({ items }: { items: Discovered[] }) {
  const { t } = useT();
  const s2 = t.sources2;
  return (
    <Section
      id="discovered"
      i={3}
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles size={15} aria-hidden="true" className="text-saffron" /> {s2.discovered}
        </span>
      }
      actions={
        items.length > 0 && (
          <Link href="/app/jobs" className="text-xs font-semibold text-accent-text hover:underline">
            {s2.seeAll}
          </Link>
        )
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted">{s2.discoveredEmpty}</p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {items.map((j) => (
            <li key={j.id}>
              <Link href={`/app/jobs/${j.id}`} className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2">
                <CompanyAvatar name={j.company} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{j.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {j.company}
                    {j.location && ` · ${j.location}`} · {t.jobTypes[j.type as JobType] ?? j.type}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AutoScanCard({ auto, lastRunAt }: { auto: { enabled: boolean; hours: number }; lastRunAt: string | null }) {
  const { t, locale } = useT();
  const s2 = t.sources2;
  const toast = useToast();
  const [state, setState] = useState(auto);
  const [, startTransition] = useTransition();
  const save = (next: { enabled: boolean; hours: number }) => {
    setState(next);
    startTransition(async () => {
      await setAutoScan(next.enabled, next.hours);
      toast.success(s2.auto.saved);
    });
  };
  return (
    <Section id="autoscan" i={4} title={s2.auto.title}>
      <div className="flex items-start justify-between gap-3">
        <label htmlFor="autoscan-on" className="text-sm text-ink-2">
          {s2.auto.label}
        </label>
        <Switch id="autoscan-on" checked={state.enabled} onChange={(v) => save({ ...state, enabled: v })} describedBy="autoscan-hint" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <label htmlFor="autoscan-hours" className="text-sm text-muted">
          {s2.auto.every}
        </label>
        <select
          id="autoscan-hours"
          className="input !w-auto !py-1.5"
          value={state.hours}
          disabled={!state.enabled}
          onChange={(e) => save({ ...state, hours: Number(e.target.value) })}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {fmt(s2.auto.hours, { n: h })}
            </option>
          ))}
        </select>
      </div>
      <p id="autoscan-hint" className="hint" suppressHydrationWarning>
        {s2.auto.hint} {s2.stats.lastScan}: {ago(lastRunAt, locale, s2.stats.never)}.
      </p>
    </Section>
  );
}

function History({ runs }: { runs: ScanRun[] }) {
  const { t, locale } = useT();
  const s2 = t.sources2;
  if (!runs.length) return null;
  return (
    <Section id="history" title={s2.history} i={5}>
      <div className="-mx-5 -mb-5 overflow-x-auto border-t border-line">
        <table className="table min-w-[560px]">
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
                <td className="whitespace-nowrap" title={new Date(r.started_at).toLocaleString(locale)} suppressHydrationWarning>{ago(r.started_at, locale, "—")}</td>
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
          <label className="label" htmlFor="edit-label">
            {s2.label}
          </label>
          <input id="edit-label" className="input" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="edit-kw">
            {s2.keywordsField}
          </label>
          <input id="edit-kw" className="input" value={keywords} placeholder="stage, pfe, développeur" aria-describedby="edit-kw-hint" onChange={(e) => setKeywords(e.target.value)} />
          <p id="edit-kw-hint" className="hint">
            {entry?.keywords ? s2.keywordsHint : s2.keywordsHintLocal}
          </p>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl border border-line p-3">
          <div>
            <label htmlFor="edit-keepall" className="text-sm font-semibold">
              {s2.keepAll}
            </label>
            <p id="edit-keepall-hint" className="hint !mt-0.5">
              {s2.keepAllHint}
            </p>
          </div>
          <Switch id="edit-keepall" checked={keepAll} onChange={setKeepAll} describedBy="edit-keepall-hint" />
        </div>
      </form>
    </Dialog>
  );
}
