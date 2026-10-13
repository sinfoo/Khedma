"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ClipboardPaste, Link2, Loader2, PenLine } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { JobForm, type FormValues } from "@/components/job-form";
import { createJob, fetchJobFromUrl, parsePasted } from "@/app/actions/jobs";
import type { NewJob } from "@/lib/db";
import type { PastedOffer } from "@/lib/repo/offers";
import { fmtDate } from "@/components/ui";

const MODES = ["url", "paste", "manual"] as const;
type Mode = (typeof MODES)[number];
const ICONS = { url: Link2, paste: ClipboardPaste, manual: PenLine };

const pickValues = (j: NewJob | PastedOffer, url = ""): FormValues => ({
  title: j.title,
  company: j.company,
  location: j.location,
  type: j.type,
  description: j.description,
  deadline: j.deadline ?? "",
  remote: j.remote,
  tags: j.tags,
  url,
});

export function AddOffer() {
  const { t, locale } = useT();
  const o = t.offers2;
  const [mode, setMode] = useState<Mode>("url");
  const [draft, setDraft] = useState<{ key: number; values: FormValues }>({ key: 0, values: {} });
  const load = (values: FormValues) => setDraft((d) => ({ key: d.key + 1, values }));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // URL import
  const [fetched, fetchAction, fetching] = useActionState(async (_p: { error?: string; job?: NewJob } | null, fd: FormData) => {
    const r: { error?: string; job?: NewJob } = await fetchJobFromUrl(null, fd);
    if (r.job) load(pickValues(r.job, r.job.url));
    return r;
  }, null);

  // Paste: parse after a short pause
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<PastedOffer | null>(null);
  useEffect(() => {
    if (text.trim().length < 20) return;
    const id = setTimeout(async () => {
      const r = await parsePasted(text);
      setParsed(r);
      setDraft((d) => ({ key: d.key + 1, values: pickValues(r) }));
    }, 400);
    return () => clearTimeout(id);
  }, [text]);

  const preview = mode === "url" ? fetched?.job : mode === "paste" && text.trim().length >= 20 ? parsed : null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-4">
        <div role="tablist" aria-label={o.modes.label} className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2 p-1 rise">
          {MODES.map((m, i) => {
            const Icon = ICONS[m];
            const on = mode === m;
            return (
              <button
                key={m}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`mode-${m}`}
                aria-selected={on}
                aria-controls={`panel-${m}`}
                tabIndex={on ? 0 : -1}
                className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors ${
                  on ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "text-muted hover:text-ink"
                }`}
                onClick={() => setMode(m)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const next = (i + (e.key === "ArrowRight" ? 1 : MODES.length - 1)) % MODES.length;
                  setMode(MODES[next]);
                  tabRefs.current[next]?.focus();
                }}
              >
                <Icon size={16} aria-hidden="true" /> <span className="truncate">{o.modes[m]}</span>
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`panel-${mode}`} aria-labelledby={`mode-${mode}`} className="card p-5 rise" style={{ ["--i" as string]: 1 }}>
          {mode === "url" && (
            <form action={fetchAction}>
              <label className="label" htmlFor="fetch-url">{o.urlLabel}</label>
              <div className="flex gap-2">
                <input id="fetch-url" name="url" type="url" className="input" placeholder="https://…" required aria-describedby="fetch-hint" aria-invalid={!!fetched?.error} />
                <button className="btn btn-secondary shrink-0" disabled={fetching} aria-busy={fetching}>
                  {fetching ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
                  {fetching ? o.fetching : o.fetch}
                </button>
              </div>
              <p id="fetch-hint" className="hint">{o.urlHint}</p>
              <div aria-live="polite">
                {fetched?.error && <p role="alert" className="mt-3 text-sm text-danger">{t.common.error} : {fetched.error}</p>}
                {fetched?.job && <p className="mt-3 text-sm text-success">{o.fetched}</p>}
              </div>
            </form>
          )}
          {mode === "paste" && (
            <div>
              <label className="label" htmlFor="paste-text">{o.pasteLabel}</label>
              <textarea
                id="paste-text"
                className="input !min-h-72 text-sm"
                placeholder={o.pastePh}
                aria-describedby="paste-hint"
                maxLength={20000}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p id="paste-hint" className="hint">{o.pasteHint}</p>
            </div>
          )}
          {mode === "manual" && <p className="text-sm text-muted">{o.newLead}</p>}
        </div>

        {mode !== "manual" && (
          <section className="card p-5 rise" style={{ ["--i" as string]: 2 }} aria-labelledby="preview-h" aria-live="polite">
            <h2 id="preview-h" className="text-xs font-semibold uppercase tracking-wide text-muted">{mode === "url" ? o.preview : o.detected}</h2>
            {preview && (preview.title || preview.company) ? (
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {(
                  [
                    [t.jobs.fields.title, preview.title],
                    [t.jobs.fields.company, preview.company],
                    [t.jobs.fields.location, preview.location],
                    [t.jobs.fields.type, t.jobTypes[preview.type]],
                    [t.jobs.fields.deadline, preview.deadline ? fmtDate(preview.deadline, locale) : ""],
                    [t.jobs.fields.remote, preview.remote ? t.common.yes : ""],
                    [t.offers2.tags, preview.tags.join(", ")],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className={v ? "text-ink" : "text-muted"}>{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted">{o.detectedNothing}</p>
            )}
          </section>
        )}
      </div>

      <section className="card p-5 rise" style={{ ["--i" as string]: 3 }} aria-labelledby="form-h">
        <h2 id="form-h" className="mb-4 text-xl">{o.formTitle}</h2>
        <JobForm key={draft.key} initial={draft.values} action={createJob} submitLabel={o.save} />
      </section>
    </div>
  );
}
