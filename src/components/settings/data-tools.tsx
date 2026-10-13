"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Database, Download, FileSpreadsheet, Loader2, Trash2, Upload } from "lucide-react";
import { Dialog } from "@/components/kit/dialog";
import { useToast } from "@/components/kit/toast";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { resetData } from "@/app/actions/settings";
import { CopyButton } from "./ai-engine";

interface Preview {
  exported_at: string;
  tables: { table: string; backup: number; current: number | null }[];
}

function bytes(n: number, locale: string) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString(locale, { maximumFractionDigits: 1 })} ${u[i]}`;
}

export function DataTools({ file, size, jobs, applications }: { file: string; size: number; jobs: number; applications: number }) {
  const { t, locale } = useT();
  const d = t.sources2.settings.data;
  const toast = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [reading, startRead] = useTransition();
  const [applying, startApply] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [resetting, startReset] = useTransition();

  const post = (body: string, m: string) => fetch(`/api/backup/import?mode=${m}`, { method: "POST", headers: { "content-type": "application/json" }, body });

  const onFile = (f: File | undefined) => {
    if (!f) return;
    startRead(async () => {
      const text = await f.text();
      const res = await post(text, "preview").catch(() => null);
      if (!res?.ok) {
        toast.error(d.invalid);
        if (input.current) input.current.value = "";
        return;
      }
      setRaw(text);
      setPreview((await res.json()) as Preview);
      setMode("merge");
    });
  };

  const close = () => {
    setPreview(null);
    setRaw(null);
    if (input.current) input.current.value = "";
  };

  const apply = () =>
    startApply(async () => {
      if (!raw) return;
      if (mode === "replace" && !window.confirm(`${d.replace}: ${d.replaceHint}`)) return;
      const res = await post(raw, mode);
      const j = (await res.json().catch(() => ({}))) as { inserted?: number; error?: string };
      if (!res.ok) {
        toast.error(d.invalid, j.error);
        return;
      }
      toast.success(d.restored, fmt(d.restoredBody, { n: j.inserted ?? 0 }));
      close();
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
        <Database size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">{d.location}</p>
          <p className="mono mt-0.5 break-all text-sm">{file || "—"}</p>
          <p className="mt-1 text-xs text-muted tabular">{fmt(d.size, { size: bytes(size, locale), n: jobs, a: applications })}</p>
        </div>
        {file && <CopyButton text={file} label={`${t.sources2.settings.ai.copy}: ${file}`} />}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <a href="/api/backup/export" download className="card card-hover flex flex-col gap-1 p-4">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Download size={16} aria-hidden="true" className="text-accent-text" /> {d.export}
          </span>
          <span className="text-xs text-muted">{d.exportHint}</span>
        </a>
        <a href="/api/backup/applications" download className="card card-hover flex flex-col gap-1 p-4">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <FileSpreadsheet size={16} aria-hidden="true" className="text-accent-text" /> {d.csv}
          </span>
          <span className="text-xs text-muted">{d.csvHint}</span>
        </a>
        <label className="card card-hover flex cursor-pointer flex-col gap-1 p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ring)]">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {reading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" className="text-accent-text" />}
            {reading ? d.reading : d.import}
          </span>
          <span className="text-xs text-muted">{d.importHint}</span>
          <input ref={input} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>

      <div className="rounded-xl border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] p-4">
        <p className="text-sm font-semibold text-danger">{d.reset}</p>
        <p className="mt-1 text-sm text-ink-2">{d.resetLead}</p>
        <button type="button" className="btn btn-danger btn-sm mt-3" onClick={() => setResetOpen(true)}>
          <Trash2 size={14} aria-hidden="true" /> {d.reset}
        </button>
      </div>

      <Dialog
        open={!!preview}
        onClose={close}
        title={preview ? fmt(d.preview, { date: preview.exported_at ? new Date(preview.exported_at).toLocaleString(locale) : "—" }) : d.import}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={close}>
              {d.cancel}
            </button>
            <button type="button" className={`btn ${mode === "replace" ? "btn-danger" : "btn-primary"}`} disabled={applying} aria-busy={applying} onClick={apply}>
              {applying && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {applying ? d.applying : `${d.apply} · ${mode === "merge" ? d.merge : d.replace}`}
            </button>
          </>
        }
      >
        {preview && (
          <div className="space-y-4">
            <div className="max-h-64 overflow-auto rounded-xl border border-line">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{d.colTable}</th>
                    <th scope="col" className="text-right">
                      {d.colBackup}
                    </th>
                    <th scope="col" className="text-right">
                      {d.colCurrent}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.tables.map((r) => (
                    <tr key={r.table} className={r.current === null ? "text-muted" : ""}>
                      <td className="mono">{r.table}</td>
                      <td className="tabular text-right">{r.backup}</td>
                      <td className="tabular text-right">{r.current ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <fieldset>
              <legend className="label">{d.mode}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["merge", "replace"] as const).map((m) => (
                  <label
                    key={m}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ring)] ${mode === m ? (m === "replace" ? "border-danger bg-danger-soft" : "border-accent bg-accent-soft") : "border-line"}`}
                  >
                    <input type="radio" name="restore-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1 accent-[var(--accent)]" />
                    <span>
                      <span className="block text-sm font-semibold">{m === "merge" ? d.merge : d.replace}</span>
                      <span className="block text-xs text-ink-2">{m === "merge" ? d.mergeHint : d.replaceHint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </Dialog>

      <Dialog
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setTyped("");
        }}
        title={d.reset}
        description={d.resetLead}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setResetOpen(false)}>
              {d.cancel}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={typed !== "RESET" || resetting}
              aria-busy={resetting}
              onClick={() =>
                startReset(async () => {
                  const r = await resetData(typed);
                  if (!r.ok) return;
                  setResetOpen(false);
                  setTyped("");
                  toast.success(d.resetDone);
                  router.refresh();
                })
              }
            >
              {resetting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />} {d.resetButton}
            </button>
          </>
        }
      >
        <label className="label" htmlFor="reset-confirm">
          {d.resetType}
        </label>
        <input
          id="reset-confirm"
          className="input mono"
          value={typed}
          autoComplete="off"
          spellCheck={false}
          placeholder="RESET"
          onChange={(e) => setTyped(e.target.value)}
        />
      </Dialog>
    </div>
  );
}
