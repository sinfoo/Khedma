"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, AlertTriangle, Bold, CheckCircle2, Circle, Copy, Heading2, Heading3, Info, List, Loader2, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { Progress } from "@/components/kit";
import { cvHealth, type Severity } from "@/lib/cv/health";
import type { StrengthItem } from "@/lib/cv/completeness";
import type { CvReview } from "@/lib/ai/cv-review";
import { applyReviewToCv, runCvReview } from "@/app/actions/profile";
import { Dialog } from "@/components/kit/dialog";
import { Markdown } from "@/components/markdown";
import { EngineChip } from "@/components/ui";
import { useToast } from "@/components/kit/toast";

// ---------- Markdown editor with a small toolbar ----------
export function MarkdownEditor({ id, value, onChange, label, describedBy }: { id: string; value: string; onChange: (v: string) => void; label: string; describedBy?: string }) {
  const { t } = useT();
  const tb = t.profile2.cv.toolbar;
  const ref = useRef<HTMLTextAreaElement>(null);

  const apply = (kind: "h2" | "h3" | "bullet" | "bold") => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    let next: string;
    let selA = a;
    let selB = b;
    if (kind === "bold") {
      const sel = value.slice(a, b) || "texte";
      next = `${value.slice(0, a)}**${sel}**${value.slice(b)}`;
      selA = a + 2;
      selB = a + 2 + sel.length;
    } else {
      const prefix = kind === "h2" ? "## " : kind === "h3" ? "### " : "- ";
      const start = value.lastIndexOf("\n", a - 1) + 1;
      const endNl = value.indexOf("\n", b);
      const end = endNl === -1 ? value.length : endNl;
      const block = value
        .slice(start, end)
        .split("\n")
        .map((l) => {
          const bare = l.replace(/^(#{1,6} |- |\* )/, "");
          return l.startsWith(prefix) ? bare : prefix + bare;
        })
        .join("\n");
      next = value.slice(0, start) + block + value.slice(end);
      selA = start;
      selB = start + block.length;
    }
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selA, selB);
    });
  };

  const btn = (kind: "h2" | "h3" | "bullet" | "bold", Icon: typeof Bold, title: string, kbd?: string) => (
    <button type="button" className="btn btn-ghost btn-icon btn-sm" title={kbd ? `${title} (${kbd})` : title} aria-label={title} onClick={() => apply(kind)}>
      <Icon size={16} aria-hidden="true" />
    </button>
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-line-strong focus-within:outline-2 focus-within:outline-[var(--ring)]">
      <div role="toolbar" aria-label={tb.label} aria-controls={id} className="flex items-center gap-0.5 border-b border-line bg-surface-2 px-1.5 py-1">
        {btn("h2", Heading2, tb.h2)}
        {btn("h3", Heading3, tb.h3)}
        {btn("bold", Bold, tb.bold, "Ctrl+B")}
        {btn("bullet", List, tb.bullet)}
      </div>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        aria-describedby={describedBy}
        className="mono min-h-[55vh] flex-1 resize-y bg-surface p-3.5 text-[0.84rem] leading-relaxed outline-none"
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            apply("bold");
          }
        }}
      />
    </div>
  );
}

// ---------- Profile strength ----------
export function StrengthMeter({ score, items, onJump }: { score: number; items: StrengthItem[]; onJump?: (href: string) => void }) {
  const { t } = useT();
  const s = t.profile2.strength;
  const [showAll, setShowAll] = useState(false);
  const tier = score >= 90 ? "great" : score >= 70 ? "good" : score >= 40 ? "fair" : "weak";
  const tone = score >= 70 ? "success" : score >= 40 ? "accent" : "saffron";
  const todo = items.filter((i) => !i.done).sort((a, b) => b.weight - a.weight);
  const done = items.filter((i) => i.done);
  return (
    <section className="card p-5 rise" aria-labelledby="strength-h" style={{ ["--i" as string]: 0 }}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="strength-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
            {s.title}
          </h2>
          <p className="text-sm text-muted">{s.tiers[tier]}</p>
        </div>
        <p className="display text-4xl leading-none tabular">
          {score}
          <span className="text-base text-muted">/100</span>
        </p>
      </div>
      <div className="mt-3">
        <Progress value={score} label={s.title} tone={tone} />
      </div>
      <p className="mt-2 text-xs text-muted tabular">{fmt(s.done, { n: done.length, total: items.length })}</p>
      {todo.length ? (
        <ul className="mt-3 space-y-1">
          {todo.slice(0, showAll ? undefined : 4).map((i) => (
            <li key={i.id}>
              <a
                href={i.href}
                className="group flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
                onClick={(e) => {
                  if (!onJump) return;
                  e.preventDefault();
                  onJump(i.href);
                }}
              >
                <Circle size={16} className="mt-0.5 shrink-0 text-line-strong" aria-hidden="true" />
                <span className="flex-1">{s.items[i.id]}</span>
                <span className="chip !px-1.5 text-[0.7rem] tabular">+{i.weight}</span>
              </a>
            </li>
          ))}
          {todo.length > 4 && (
            <li>
              <button type="button" className="btn btn-ghost btn-sm text-muted" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? t.common.close : `+${todo.length - 4}`}
              </button>
            </li>
          )}
        </ul>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm text-success">
          <CheckCircle2 size={16} aria-hidden="true" /> {s.allDone}
        </p>
      )}
      {done.length > 0 && todo.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer px-2 text-xs text-muted">{fmt(s.done, { n: done.length, total: items.length })}</summary>
          <ul className="mt-1 space-y-1">
            {done.map((i) => (
              <li key={i.id} className="flex items-start gap-2 px-2 py-1 text-sm text-muted">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                <span className="line-through decoration-line-strong">{s.items[i.id]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// ---------- CV health ----------
const SEV: Record<Severity, { cls: string; Icon: typeof Info }> = {
  high: { cls: "chip-danger", Icon: AlertCircle },
  medium: { cls: "chip-saffron", Icon: AlertTriangle },
  low: { cls: "", Icon: Info },
};

export function HealthPanel({ text }: { text: string }) {
  const { t } = useT();
  const h = t.profile2.health;
  const r = cvHealth(text);
  return (
    <div className="space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="display text-3xl leading-none tabular">{fmt(h.score, { n: r.score })}</p>
          <p className="mt-1 text-xs text-muted tabular">
            {fmt(h.stats, { w: r.stats.words, b: r.stats.bullets, q: r.stats.quantified })} · {fmt(h.passed, { n: r.passed.length })}
          </p>
        </div>
        <span className="chip chip-saffron">
          <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-saffron" />
          {h.engine}
        </span>
      </div>
      <div className="w-full">
        <Progress value={r.score} label={h.title} tone={r.score >= 75 ? "success" : r.score >= 50 ? "accent" : "danger"} />
      </div>
      {r.findings.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-success-soft p-3 text-sm text-success">
          <CheckCircle2 size={16} aria-hidden="true" /> {h.noIssues}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {r.findings.map((f) => {
            const { cls, Icon } = SEV[f.severity];
            return (
              <li key={f.id} className="flex items-start gap-3 p-3">
                <span className={`chip ${cls} shrink-0`}>
                  <Icon size={12} aria-hidden="true" />
                  {h.severity[f.severity]}
                </span>
                <p className="text-sm text-ink-2">{fmt(h.msg[f.id], { n: f.n ?? 0, sample: f.sample ?? "" })}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- AI review ----------
const SUB = { fontFamily: "var(--font-sans)" } as const;

export function ReviewPanel({
  initial,
  cvMd,
  onApplyRewrite,
  onReplaceCv,
}: {
  initial: CvReview | null;
  cvMd: string;
  onApplyRewrite: (before: string, after: string) => boolean;
  onReplaceCv: (md: string) => void;
}) {
  const [applying, startApply] = useTransition();
  const [proposal, setProposal] = useState<{ md: string; engine: string } | null>(null);
  const { t, locale } = useT();
  const r = t.profile2.review;
  const toast = useToast();
  const [review, setReview] = useState<CvReview | null>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = () =>
    start(async () => {
      setError(null);
      const res = await runCvReview();
      if (res.ok) setReview(res.review);
      else setError(res.error === "empty" ? r.empty : r.error);
    });
  const prio = (p: 1 | 2 | 3) => (p === 1 ? "chip-danger" : p === 2 ? "chip-saffron" : "");
  const prioLabel = (p: 1 | 2 | 3) => (p === 1 ? r.priority.p1 : p === 2 ? r.priority.p2 : r.priority.p3);
  return (
    <div className="space-y-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-2">{r.lead}</p>
        <div className="flex flex-wrap gap-2">
          {review && (
            <button
              type="button"
              className="btn btn-saffron"
              disabled={applying || pending}
              aria-busy={applying}
              onClick={() =>
                startApply(async () => {
                  const res = await applyReviewToCv();
                  if (res.ok) setProposal({ md: res.md, engine: res.engine });
                  else toast.error(res.error === "empty" ? r.empty : r.error);
                })
              }
            >
              {applying ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
              {applying ? r.applying : r.applyAll}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={run} disabled={pending} aria-busy={pending}>
            {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
            {pending ? r.running : review ? r.rerun : r.run}
          </button>
        </div>
      </div>
      <Dialog
        open={!!proposal}
        onClose={() => setProposal(null)}
        title={r.previewTitle}
        description={r.previewLead}
        wide
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setProposal(null)}>
              {r.discard}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (!proposal) return;
                onReplaceCv(proposal.md);
                setProposal(null);
              }}
            >
              {r.accept}
            </button>
          </>
        }
      >
        {proposal && (
          <div className="space-y-3">
            <EngineChip engine={proposal.engine} t={t} />
            <div className="rounded-xl border border-line p-4">
              <Markdown>{proposal.md}</Markdown>
            </div>
          </div>
        )}
      </Dialog>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {!review && !pending && !error && <p className="text-sm text-muted">{r.empty}</p>}
      {pending && !review && (
        <div className="space-y-3" aria-hidden="true">
          <div className="skeleton h-10 w-40" />
          <div className="skeleton h-24" />
          <div className="skeleton h-40" />
        </div>
      )}
      {review && (
        <div className={`space-y-5 ${pending ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-center gap-3">
            <p className="display text-3xl leading-none tabular">{fmt(r.score, { n: review.score })}</p>
            <div className="min-w-40 flex-1">
              <Progress value={review.score} label={r.title} tone={review.score >= 75 ? "success" : review.score >= 50 ? "accent" : "danger"} />
            </div>
            <EngineChip engine={review.engine} t={t} />
          </div>
          <p className="text-base font-medium">{review.verdict}</p>
          {review.strengths.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted" style={SUB}>
                {r.strengths}
              </h3>
              <ul className="space-y-1.5">
                {review.strengths.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm text-ink-2">
                    <CheckCircle2 size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {review.improvements.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted" style={SUB}>
                {r.improvements}
              </h3>
              <ol className="divide-y divide-line rounded-xl border border-line">
                {review.improvements.map((i, k) => (
                  <li key={k} className="grid gap-1 p-3 sm:grid-cols-[auto_1fr] sm:gap-3">
                    <span className={`chip ${prio(i.priority)} h-fit`}>
                      {prioLabel(i.priority)} · {i.area}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{i.issue}</p>
                      <p className="text-sm text-muted">{i.fix}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {review.rewrites.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted" style={SUB}>
                {r.rewrites}
              </h3>
              <ul className="space-y-3">
                {review.rewrites.map((w, k) => (
                  <li key={k} className="rounded-xl border border-line p-3">
                    <p className="text-xs font-semibold text-muted">{r.before}</p>
                    <p className="text-sm text-ink-2 line-through decoration-danger/50">{w.before}</p>
                    <p className="mt-2 text-xs font-semibold text-muted">{r.after}</p>
                    <p className="text-sm font-medium">{w.after}</p>
                    <p className="mt-1 text-xs text-muted">
                      <span className="font-semibold">{r.why}:</span> {w.why}
                    </p>
                    <div className="mt-2 flex gap-2">
                      {cvMd.trim() && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => (onApplyRewrite(w.before, w.after) ? toast.success(r.applied) : toast.info(r.notFound))}
                        >
                          {r.apply}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          navigator.clipboard.writeText(w.after);
                          toast.success(r.copied);
                        }}
                      >
                        <Copy size={14} aria-hidden="true" /> {r.copy}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {review.missing_sections.length > 0 && (
            <p className="text-sm text-ink-2">
              <span className="font-semibold">{r.missing}:</span> {review.missing_sections.join(", ")}
            </p>
          )}
          {review.target_fit && (
            <section className="rounded-xl bg-accent-soft/60 p-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-accent-text" style={SUB}>
                {r.targetFit}
              </h3>
              <p className="text-sm text-ink-2">{review.target_fit}</p>
            </section>
          )}
          <p className="text-xs text-muted">{fmt(r.at, { d: new Date(review.created_at).toLocaleString(locale === "fr" ? "fr-TN" : "en-GB") })}</p>
        </div>
      )}
    </div>
  );
}
