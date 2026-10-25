"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2, Play, Save, Trash2 } from "lucide-react";
import { useToast } from "@/components/kit/toast";
import { errorReason } from "@/components/sources/error-reason";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { saveKeys, testKeys, type KeyGroup } from "@/app/actions/keys";

/**
 * One card per keyed provider (the catalog's `needsEnv`, so new boards appear here on their own) plus the AI.
 * Fields are write-only: a saved key shows as "•••• set" and is never sent back to the page.
 */
export function ApiKeys({ groups: initial }: { groups: KeyGroup[] }) {
  const { t } = useT();
  const [groups, setGroups] = useState(initial);
  return (
    <>
      <p id="keys-hint" className="hint -mt-1 mb-3">{t.sources2.settings.keys.hidden}</p>
      <ul className="space-y-3">
        {groups.map((g) => (
          <KeyCard key={g.id} group={g} onSaved={setGroups} />
        ))}
      </ul>
    </>
  );
}

function KeyCard({ group: g, onSaved }: { group: KeyGroup; onSaved: (g: KeyGroup[]) => void }) {
  const { t } = useT();
  const k = t.sources2.settings.keys;
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const typed = Object.values(values).some((v) => v.trim());
  const allSet = g.keys.every((x) => x.source);
  const fromApp = g.keys.some((x) => x.source === "app");

  const save = (v: Record<string, string>) =>
    startSave(async () => {
      onSaved(await saveKeys(v));
      setValues({});
      setResult(null);
      toast.success(Object.values(v).some((x) => x.trim()) ? k.saved : k.removed, g.name);
    });

  return (
    <li className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base" style={{ fontFamily: "var(--font-sans)" }}>{g.name}</h3>
        {g.site && (
          <a href={g.site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accent-text">
            {k.getKey} <ExternalLink size={12} aria-hidden="true" />
            <span className="sr-only">({g.name})</span>
          </a>
        )}
      </div>
      <p className="mt-0.5 text-[0.8rem] text-muted">{g.id === "ai" ? k.aiNote : fmt(k.boardNote, { name: g.name })}</p>
      <form
        className="mt-3 space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed) save(values);
        }}
      >
        {g.keys.map((x) => {
          const id = `key-${x.name}`;
          return (
            <div key={x.name}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={id} className="mono text-[0.78rem] font-semibold text-ink-2">{x.name}</label>
                <span className={`chip !py-0 text-[0.7rem] ${x.source ? "chip-success" : ""}`} id={`${id}-st`}>{x.source === "app" ? k.set : x.source === "env" ? k.setEnv : k.notSet}</span>
              </div>
              <input
                id={id}
                type="password"
                className="input mono mt-1"
                autoComplete="off"
                spellCheck={false}
                placeholder={x.source ? k.replacePh : k.placeholder}
                aria-describedby={`${id}-st keys-hint`}
                value={values[x.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [x.name]: e.target.value }))}
              />
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" className="btn btn-primary btn-sm" disabled={!typed || saving} aria-busy={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />} {k.save}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!allSet || testing || typed}
            aria-busy={testing}
            title={typed ? k.saveFirst : undefined}
            onClick={() =>
              startTest(async () => {
                setResult(null);
                const r = await testKeys(g.id);
                setResult(r.ok ? { ok: true, text: r.n ? fmt(k.testOkN, { n: r.n }) : k.testOk } : { ok: false, text: fmt(k.testFail, { reason: errorReason(t, r.error) }) });
              })
            }
          >
            {testing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} {testing ? k.testing : k.test}
          </button>
          {fromApp && (
            <button type="button" className="btn btn-ghost btn-sm text-muted" disabled={saving} onClick={() => save(Object.fromEntries(g.keys.map((x) => [x.name, ""])))}>
              <Trash2 size={14} aria-hidden="true" /> {k.remove}
            </button>
          )}
          <span aria-live="polite" className={`text-[0.8rem] font-semibold ${result?.ok ? "text-success" : "text-danger"}`}>{result?.text}</span>
        </div>
      </form>
    </li>
  );
}
