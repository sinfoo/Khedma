"use client";

import { useState, useTransition } from "react";
import { Building2, Loader2, Plus, Trash2 } from "lucide-react";
import { CompanyAvatar, Section } from "@/components/kit";
import { useToast } from "@/components/kit/toast";
import { ToggleBox } from "@/components/toggle-box";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import type { SourceRow } from "@/lib/repo/sources";
import { addTrackedCompany, removeSource } from "@/app/actions/sources";
import { errorReason } from "./error-reason";
import { YieldNote, type Yields } from "./sources-board";

type Kind = "greenhouse" | "lever" | "ashby" | "rss" | "careers";

/** "Entreprises suivies", mounted on the Sources tab. `school` names the suggestions (ENIT by default). */
export function TrackedCompanies({ tracked, suggestions, school, yields }: { tracked: SourceRow[]; suggestions: { name: string; url: string }[]; school: string; yields: Yields }) {
  const { t } = useT();
  const s = t.sources2.tracked;
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busyName, setBusyName] = useState<string | null>(null);
  const have = new Set(tracked.map((x) => x.label.toLowerCase()));

  const add = (u: string, name?: string) => {
    setError(null);
    setBusyName(name ?? "__url");
    start(async () => {
      const r = await addTrackedCompany(u, name);
      setBusyName(null);
      if (r.ok) {
        setUrl("");
        const kind = s.kinds[r.kind as Kind] ?? r.kind;
        toast.success(fmt(s.added, { label: r.label }), r.kind === "careers" && !r.ats ? s.detectedPage : fmt(s.detected, { ats: r.ats ?? kind }));
      } else {
        const msg = r.error === "duplicate" ? s.duplicate : r.error === "invalid" ? s.invalid : s.unreachable;
        if (name) toast.error(name, msg);
        else setError(msg);
      }
    });
  };

  return (
    <Section id="tracked" title={s.title} i={7}>
      <p className="-mt-2 mb-4 text-sm text-muted">{s.lead}</p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim() && !pending) add(url.trim());
        }}
      >
        <label className="sr-only" htmlFor="tracked-url">
          {s.urlLabel}
        </label>
        <input
          id="tracked-url"
          type="url"
          inputMode="url"
          className="input mono flex-1"
          placeholder={s.urlPh}
          value={url}
          required
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "tracked-error" : undefined}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
          {pending && busyName === "__url" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          {pending && busyName === "__url" ? s.adding : s.add}
        </button>
      </form>
      {error && (
        <p id="tracked-error" role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {tracked.length === 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-dashed border-line-strong p-4">
          <Building2 size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">{s.empty}</p>
            <p className="text-sm text-muted">{fmt(s.emptyHint, { school })}</p>
          </div>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {tracked.map((c) => (
            <TrackedItem key={c.id} source={c} y={yields[c.id]} />
          ))}
        </ul>
      )}

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{fmt(s.suggestions, { school })}</p>
        <p className="mb-2 text-xs text-muted">{s.suggestionsHint}</p>
        <ul className="flex flex-wrap gap-1.5">
          {suggestions
            .filter((c) => !have.has(c.name.toLowerCase()))
            .map((c) => (
              <li key={c.url}>
                <button type="button" className="chip min-h-7 cursor-pointer hover:border-line-strong" disabled={pending} onClick={() => add(c.url, c.name)} aria-label={fmt(s.enable, { label: c.name })}>
                  {busyName === c.name ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <Plus size={11} aria-hidden="true" />} {c.name}
                </button>
              </li>
            ))}
        </ul>
      </div>
  </Section>
  );
}

function TrackedItem({ source: c, y }: { source: SourceRow; y?: Yields[number] }) {
  const { t } = useT();
  const s = t.sources2.tracked;
  const toast = useToast();
  const [, start] = useTransition();
  const kind = s.kinds[c.kind as Kind] ?? c.kind;
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-3 ${c.enabled ? "" : "opacity-70"}`}>
      <CompanyAvatar name={c.label} size={32} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-medium">{c.label}</p>
        <p className="truncate text-xs text-muted">
          <span className="chip !py-0 text-[0.7rem]">{kind}</span> <span className="mono">{c.handle}</span>
          {c.last_error && <span className="text-danger"> · {errorReason(t, c.last_error)}</span>}
        </p>
        <YieldNote y={y} />
      </div>
      <ToggleBox id={c.id} enabled={c.enabled} label={fmt(s.enable, { label: c.label })} />
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-icon"
        aria-label={`${s.remove}: ${c.label}`}
        title={s.remove}
        onClick={() => {
          if (!window.confirm(t.sources2.removeConfirm)) return;
          start(async () => {
            await removeSource(c.id);
            toast.success(t.sources2.removed, c.label);
          });
        }}
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </li>
  );
}
