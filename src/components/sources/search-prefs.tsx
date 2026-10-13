"use client";

import { useState, useTransition } from "react";
import { Brush, Loader2, Save } from "lucide-react";
import { useToast } from "@/components/kit/toast";
import { Switch } from "@/components/toggle-box";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { HOURS_OLD, LEVELS, type SearchPrefs } from "@/lib/search/prefs";
import { runSweep, saveSearchPrefs } from "@/app/actions/sources";

/** Work preferences form (levels, freshness, blacklists). Same card on the Sources page and inside the search bar. */
export function SearchPrefsForm({ prefs, compact = false, onSaved }: { prefs: SearchPrefs; compact?: boolean; onSaved?: (p: SearchPrefs) => void }) {
  const { t } = useT();
  const p = t.sources2.prefs;
  const toast = useToast();
  const [v, setV] = useState(prefs);
  const [pending, start] = useTransition();
  const [sweeping, startSweep] = useTransition();
  const parse = (s: string) => s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  const id = compact ? "sp-c" : "sp";

  const save = () =>
    start(async () => {
      const next = await saveSearchPrefs(v);
      setV(next);
      onSaved?.(next);
      toast.success(p.saved);
    });

  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {!compact && <p className="text-sm text-muted">{p.lead}</p>}
      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="mb-1 text-xs font-semibold text-muted">{p.levels}</legend>
        {LEVELS.map((l) => {
          const on = v.levels.includes(l);
          return (
            <button key={l} type="button" aria-pressed={on} className={`chip min-h-7 cursor-pointer ${on ? "chip-accent" : ""}`} onClick={() => setV({ ...v, levels: on ? v.levels.filter((x) => x !== l) : [...v.levels, l] })}>
              {p.level[l]}
            </button>
          );
        })}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-hours`} className="text-xs font-semibold text-muted">
          {p.hoursOld}
        </label>
        <select id={`${id}-hours`} className="input !w-auto !py-1.5" value={v.hoursOld} onChange={(e) => setV({ ...v, hoursOld: Number(e.target.value) as SearchPrefs["hoursOld"] })}>
          {HOURS_OLD.map((h) => (
            <option key={h} value={h}>
              {p.hours[h]}
            </option>
          ))}
        </select>
      </div>
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-3"}`}>
        {(
          [
            ["titleBlacklist", p.titleBlacklist, p.titleBlacklistPh],
            ["companyBlacklist", p.companyBlacklist, p.companyBlacklistPh],
            ["locationReject", p.locationReject, p.locationRejectPh],
          ] as const
        ).map(([k, label, ph]) => (
          <div key={k}>
            <label className="label" htmlFor={`${id}-${k}`}>
              {label}
            </label>
            <input id={`${id}-${k}`} className="input" defaultValue={v[k].join(", ")} placeholder={ph} aria-describedby={`${id}-prefix`} onChange={(e) => setV({ ...v, [k]: parse(e.target.value) })} />
          </div>
        ))}
      </div>
      <p id={`${id}-prefix`} className="hint">
        {p.prefixHint}
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2">
          <Switch id={`${id}-senior`} checked={v.includeSenior} onChange={(c) => setV({ ...v, includeSenior: c })} />
          <label htmlFor={`${id}-senior`}>{p.includeSenior}</label>
        </span>
        <span className="flex items-center gap-2">
          <Switch id={`${id}-once`} checked={v.applyOnceAtCompany} onChange={(c) => setV({ ...v, applyOnceAtCompany: c })} />
          <label htmlFor={`${id}-once`}>{p.applyOnce}</label>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending} aria-busy={pending}>
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />} {p.save}
        </button>
        {!compact && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={sweeping}
            aria-busy={sweeping}
            title={p.sweepHint}
            onClick={() =>
              startSweep(async () => {
                const r = await runSweep();
                toast.info(fmt(p.swept, { urgent: r.urgent, merged: r.merged }));
              })
            }
          >
            {sweeping ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Brush size={14} aria-hidden="true" />} {sweeping ? p.sweeping : p.sweep}
          </button>
        )}
      </div>
    </form>
  );
}
