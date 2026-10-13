"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Cpu, Loader2, Play, RefreshCw, Cloud, KeyRound } from "lucide-react";
import { useToast } from "@/components/kit/toast";
import { EngineChip } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { checkOllama, saveEngineSettings, testEngine } from "@/app/actions/settings";
import type { Settings } from "@/lib/types";
import { Segmented } from "./segmented";

const PROVIDERS = ["auto", "claude", "ollama", "offline"] as const;
const CLAUDE_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5-20251001"] as const;
const RECOMMENDED = [
  { model: "llama3.1:8b", ram: "8 GB" },
  { model: "qwen2.5:7b", ram: "8 GB" },
  { model: "mistral", ram: "8 GB" },
  { model: "gemma3:4b", ram: "6 GB" },
  { model: "phi4-mini", ram: "4 GB" },
] as const;

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

function Cmd({ cmd }: { cmd: string }) {
  const { t } = useT();
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-surface-2 py-0.5 pl-2.5 pr-0.5">
      <code className="mono truncate text-[0.8rem]">{cmd}</code>
      <CopyButton text={cmd} label={fmt(t.sources2.settings.ai.copyCmd, { cmd })} />
    </span>
  );
}

export function AiEngine({
  settings,
  claude,
  ollama,
  engine,
}: {
  settings: Pick<Settings, "provider" | "claude_model" | "ollama_url" | "ollama_model">;
  claude: { configured: boolean; working: boolean };
  ollama: { ok: boolean; models: string[]; version?: string };
  engine: string;
}) {
  const { t } = useT();
  const a = t.sources2.settings.ai;
  const toast = useToast();
  const [form, setForm] = useState(settings);
  const [health, setHealth] = useState(ollama);
  const [current, setCurrent] = useState(engine);
  const [test, setTest] = useState<{ engine: string; ms: number; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const uses = (p: "claude" | "ollama") => form.provider === p || form.provider === "auto";

  const modelOptions = health.models.length ? [...new Set([...health.models, ...(health.models.includes(form.ollama_model) ? [] : [form.ollama_model])])] : [];

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

      <div className="grid gap-4 md:grid-cols-2">
        {/* Claude */}
        <section aria-labelledby="claude-h" className={`rounded-2xl border border-line p-4 transition-opacity ${uses("claude") ? "" : "opacity-60"}`}>
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
          <select id="claude-model" className="input" value={form.claude_model} onChange={(e) => set("claude_model", e.target.value)}>
            {CLAUDE_MODELS.map((m) => (
              <option key={m} value={m}>
                {a.claudeModels[m]}
              </option>
            ))}
          </select>
        </section>

        {/* Ollama */}
        <section aria-labelledby="ollama-h" className={`rounded-2xl border border-line p-4 transition-opacity ${uses("ollama") ? "" : "opacity-60"}`}>
          <h3 id="ollama-h" className="flex items-center gap-2 text-base" style={{ fontFamily: "var(--font-sans)" }}>
            <Cpu size={16} aria-hidden="true" className="text-accent-text" /> {a.ollamaTitle}
          </h3>
          <label className="label mt-3" htmlFor="ollama-url">
            {a.ollamaUrl}
          </label>
          <div className="flex gap-2">
            <input
              id="ollama-url"
              className="input mono"
              inputMode="url"
              spellCheck={false}
              value={form.ollama_url}
              aria-describedby="ollama-status"
              onChange={(e) => set("ollama_url", e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary btn-icon shrink-0"
              aria-label={a.refresh}
              title={a.refresh}
              disabled={refreshing}
              onClick={() => startRefresh(async () => setHealth(await checkOllama(form.ollama_url)))}
            >
              <RefreshCw size={16} aria-hidden="true" className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>
          <p id="ollama-status" className="mt-2 text-xs" role="status">
            {health.ok ? (
              <span className="text-success">
                ● {a.online}
                {health.version && ` · ${fmt(a.version, { v: health.version })}`} · {fmt(a.installed, { n: health.models.length })}
              </span>
            ) : (
              <span className="text-muted">{a.notRunning}</span>
            )}
          </p>
          <label className="label mt-3" htmlFor="ollama-model">
            {a.model}
          </label>
          {modelOptions.length ? (
            <select id="ollama-model" className="input mono" value={form.ollama_model} onChange={(e) => set("ollama_model", e.target.value)}>
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input id="ollama-model" className="input mono" list="model-suggest" value={form.ollama_model} aria-describedby="ollama-model-hint" onChange={(e) => set("ollama_model", e.target.value)} />
              <datalist id="model-suggest">
                {RECOMMENDED.map((r) => (
                  <option key={r.model} value={r.model} />
                ))}
              </datalist>
              <p id="ollama-model-hint" className="hint">
                {a.noModels}
              </p>
            </>
          )}
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

      <div>
        <h3 className="mb-2 text-base" style={{ fontFamily: "var(--font-sans)" }}>
          {a.recommended}
        </h3>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="table min-w-[600px]">
            <thead>
              <tr>
                <th scope="col">{a.colModel}</th>
                <th scope="col">{a.colRam}</th>
                <th scope="col">{a.colBest}</th>
                <th scope="col">{a.colPull}</th>
              </tr>
            </thead>
            <tbody>
              {RECOMMENDED.map((r) => (
                <tr key={r.model}>
                  <td className="mono whitespace-nowrap">
                    {r.model}
                    {health.models.some((m) => m === r.model || m.split(":")[0] === r.model) && <span className="chip chip-success ml-2 !py-0 text-[0.7rem]">✓</span>}
                  </td>
                  <td className="tabular whitespace-nowrap">{r.ram}</td>
                  <td className="text-ink-2">{a.best[r.model]}</td>
                  <td>
                    <Cmd cmd={`ollama pull ${r.model}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="rounded-xl border border-line p-4 [&[open]>summary]:mb-3">
        <summary className="cursor-pointer text-sm font-semibold">{a.install}</summary>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-2">
          {a.installSteps.map((s, i) => (
            <li key={i}>
              {s}
              {i === 1 && (
                <div className="mt-1.5">
                  <Cmd cmd="winget install Ollama.Ollama" />
                </div>
              )}
              {i === 2 && (
                <div className="mt-1.5">
                  <Cmd cmd="ollama pull qwen2.5:7b" />
                </div>
              )}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
