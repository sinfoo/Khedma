"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, Play, Cloud, KeyRound } from "lucide-react";
import { useToast } from "@/components/kit/toast";
import { EngineChip } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { saveEngineSettings, testEngine } from "@/app/actions/settings";
import type { Settings } from "@/lib/types";
import { Segmented } from "./segmented";

const PROVIDERS = ["auto", "offline"] as const;
const CLAUDE_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5-20251001"] as const;
export function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon btn-sm"
      aria-label={label}
      title={t.sources2.settings.ai.copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard blocked: the command stays selectable on screen
        }
      }}
    >
      {done ? <Check size={14} aria-hidden="true" className="text-success" /> : <Copy size={14} aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">
        {done ? t.sources2.settings.ai.copied : ""}
      </span>
    </button>
  );
}

export function AiEngine({
  settings,
  claude,
  engine,
}: {
  settings: Pick<Settings, "provider" | "claude_model">;
  claude: { configured: boolean; working: boolean };
  engine: string;
}) {
  const { t } = useT();
  const a = t.sources2.settings.ai;
  const toast = useToast();
  const [form, setForm] = useState(settings);
  const [current, setCurrent] = useState(engine);
  const [test, setTest] = useState<{ engine: string; ms: number; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <Segmented
        name="provider"
        legend={a.provider}
        value={form.provider}
        options={PROVIDERS.map((p) => ({ value: p, label: a.providers[p] }))}
        onChange={(p) => set("provider", p)}
        hint={a.providerHint[form.provider]}
      />

      <div>
        <section aria-labelledby="claude-h" className={`rounded-2xl border border-line p-4 transition-opacity ${form.provider === "offline" ? "opacity-60" : ""}`}>
          <h3 id="claude-h" className="flex items-center gap-2 text-base" style={{ fontFamily: "var(--font-sans)" }}>
            <Cloud size={16} aria-hidden="true" className="text-accent-text" /> {a.claudeTitle}
          </h3>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{a.keyDetected}</dt>
              <dd>
                <span className={`chip ${claude.configured ? "chip-success" : "chip-saffron"}`}>{claude.configured ? a.keyStatus.yes : a.keyStatus.no}</span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{a.keyWorking}</dt>
              <dd>
                <span className={`chip ${claude.working ? "chip-success" : claude.configured ? "chip-danger" : ""}`}>{claude.working ? a.keyStatus.yes : a.keyStatus.no}</span>
              </dd>
            </div>
          </dl>
          {!claude.working && (
            <p className="mt-3 flex gap-2 rounded-lg bg-surface-2 p-2.5 text-xs leading-relaxed text-ink-2">
              <KeyRound size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{a.keyHelp}</span>
            </p>
          )}
          <label className="label mt-4" htmlFor="claude-model">
            {a.claudeModel}
          </label>
          <select id="claude-model" className="input" value={form.claude_model} aria-describedby="claude-model-hint" onChange={(e) => set("claude_model", e.target.value)}>
            {CLAUDE_MODELS.map((m) => (
              <option key={m} value={m}>
                {a.claudeModels[m].split(" — ")[0]}
              </option>
            ))}
          </select>
          <p id="claude-model-hint" className="hint">
            {a.claudeModels[form.claude_model as (typeof CLAUDE_MODELS)[number]]?.split(" — ")[1]}
          </p>
        </section>

      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          aria-busy={saving}
          onClick={() =>
            startSave(async () => {
              const r = await saveEngineSettings(form);
              setCurrent(r.engine);
              toast.success(a.saved, fmt(a.current, { engine: r.engine }));
            })
          }
        >
          {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {a.save}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={testing}
          aria-busy={testing}
          onClick={() =>
            startTest(async () => {
              setTest(null);
              setTest(await testEngine(form));
            })
          }
        >
          {testing ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />} {testing ? a.testing : a.test}
        </button>
        <span className="ml-auto inline-flex items-center gap-2 text-sm text-muted">
          {fmt(a.current, { engine: "" })}
          <EngineChip engine={current} t={t} />
        </span>
      </div>

      <div aria-live="polite">
        {test && (
          <div className="rounded-xl border border-line bg-surface-2 p-4 fade">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <EngineChip engine={test.engine} t={t} />
              {test.engine === "heuristic" ? fmt(a.testFallback, { ms: test.ms }) : fmt(a.testOk, { engine: test.engine, ms: test.ms })}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">{a.sample}</p>
            <p className="mt-1 text-sm text-ink-2">{test.text}</p>
          </div>
        )}
      </div>

    </div>
  );
}
