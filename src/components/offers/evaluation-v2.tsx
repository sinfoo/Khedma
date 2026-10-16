"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { AlertTriangle, Check, FileText, Minus, ShieldAlert, ShieldCheck, ShieldQuestion, Sparkles, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import type { Evaluation, Requirement } from "@/lib/types";
import type { Gate } from "@/lib/ai/gates";
import { ActionButton } from "@/components/action-button";
import { runEvaluation, setTriageMarginals } from "@/app/actions/jobs";

const IMP_CLS: Record<Requirement["importance"], string> = { critical: "chip-danger", high: "chip-saffron", meaningful: "chip-accent", preferred: "", low_signal: "" };
const MET_ICON = { yes: Check, partial: Minus, no: X } as const;
const MET_CLS = { yes: "bg-success-soft text-success", partial: "bg-saffron-soft text-saffron", no: "bg-danger-soft text-danger" } as const;
const TIER_CLS = { high: "chip-success", caution: "chip-saffron", suspicious: "chip-danger" } as const;
const TIER_ICON = { high: ShieldCheck, caution: ShieldQuestion, suspicious: ShieldAlert } as const;
const sans = { fontFamily: "var(--font-sans)", letterSpacing: 0 } as const;

/** Evaluation v2 blocks for the Fit tab: triage, gates, requirement table, legitimacy, company/comp, level plan, CV changes. */
export function EvaluationV2({ ev, jobId, appId, marginals, gates }: { ev: Evaluation; jobId: number; appId: number | null; marginals: boolean; gates: Gate[] }) {
  const { t } = useT();
  const v = t.offers2.v2;
  const reqs = ev.requirements ?? [];
  const leg = ev.legitimacy;
  const TierIcon = leg ? TIER_ICON[leg.tier] : ShieldQuestion;
  const signalLabel = (key: string) => (v.signals as Record<string, string>)[key] ?? key;
  const docsHref = appId ? `/app/pipeline/${appId}?tab=documents` : null;

  return (
    <div className="space-y-6">
      {ev.triage?.skipped && (
        <section className="card border-saffron/40 p-5 rise" aria-labelledby="triage-h">
          <h3 id="triage-h" className="flex items-center gap-2 text-sm font-semibold" style={sans}>
            <AlertTriangle size={15} className="text-saffron" aria-hidden="true" /> {v.triageTitle}
          </h3>
          <p className="mt-2 chip chip-saffron whitespace-normal">{fmt(v.triaged, { reason: ev.triage.reason })}</p>
          <p className="mt-2 text-xs text-muted">{fmt(v.triageScore, { s: ev.triage.score, v: v.triageVerdict[ev.triage.verdict] })} · {v.triageHint}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ActionButton action={runEvaluation.bind(null, jobId)} pendingLabel={t.offers2.evaluating} className="btn btn-primary btn-sm">
              <Sparkles size={14} aria-hidden="true" /> {v.evaluateFully}
            </ActionButton>
            <MarginalsToggle on={marginals} label={v.marginals} />
          </div>
        </section>
      )}

      {gates.length > 0 && (
        <section className="card border-danger/40 p-5 rise" aria-labelledby="gates-h">
          <h3 id="gates-h" className="flex items-center gap-2 text-sm font-semibold" style={sans}>
            <ShieldAlert size={15} className="text-danger" aria-hidden="true" /> {v.gates}
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {gates.map((g) => (
              <li key={`${g.key}-${g.lang ?? ""}`} className="flex flex-wrap items-start gap-2">
                <span className={`chip ${g.level === "fail" ? "chip-danger" : "chip-saffron"}`}>{fmt(v.gateKeys[g.key], { lang: g.lang ?? "" })}</span>
                <q className="text-ink-2">{g.quote}</q>
              </li>
            ))}
          </ul>
          <p className="hint mt-2">{v.gateHint}</p>
        </section>
      )}

      <section className="card p-5 rise" aria-labelledby="req-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="req-h" className="text-sm font-semibold" style={sans}>{v.requirements}</h3>
          {ev.archetype && <span className="chip mono">{v.archetype}: {ev.archetype}</span>}
        </div>
        <p className="mt-1 text-xs text-muted">{v.requirementsHint}</p>
        {reqs.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{v.noRequirements}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="table w-full min-w-[36rem] text-sm">
              <thead>
                <tr>
                  <th scope="col" className="text-left">{v.reqText}</th>
                  <th scope="col" className="text-left">{v.reqImportance}</th>
                  <th scope="col" className="text-left">{v.reqMatch}</th>
                  <th scope="col" className="text-left">{v.reqProof}</th>
                </tr>
              </thead>
              <tbody>
                {reqs.map((r, i) => {
                  const Icon = MET_ICON[r.met];
                  return (
                    <tr key={`${r.text}-${i}`} className="rise" style={{ ["--i" as string]: i }}>
                      <td className="align-top">{r.text}</td>
                      <td className="align-top whitespace-nowrap">
                        <span className={`chip ${IMP_CLS[r.importance]}`}>{v.importance[r.importance]}</span>
                        <span className="ml-1 text-[0.7rem] text-muted">{v.evidence[r.evidence]}</span>
                      </td>
                      <td className="align-top whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${MET_CLS[r.met]}`}>
                          <Icon size={12} aria-hidden="true" /> {v.met[r.met]}
                        </span>
                      </td>
                      <td className="align-top text-xs text-ink-2">{r.proof ? <q>{r.proof}</q> : <span className="text-muted">{r.met === "yes" ? "" : v.noProof}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {leg && (
          <section className="card p-5 rise" style={{ ["--i" as string]: 1 }} aria-labelledby="leg-h">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="leg-h" className="text-sm font-semibold" style={sans}>{v.legitimacy}</h3>
              <span className={`chip ${TIER_CLS[leg.tier]}`}><TierIcon size={12} aria-hidden="true" /> {v.tiers[leg.tier]} · <span className="tabular">{leg.score}</span></span>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {leg.signals.map((s) => (
                <li key={s.key} className="flex items-start justify-between gap-3">
                  <span className={s.delta < 0 ? "text-ink-2" : "text-muted"}>{signalLabel(s.key)}</span>
                  <span className={`mono text-xs ${s.delta < 0 ? "text-danger" : "text-muted"}`}>{s.delta < 0 ? s.delta : "✓"}</span>
                </li>
              ))}
            </ul>
            <p className="hint mt-3">{v.legitimacyHint}</p>
          </section>
        )}
        <section className="card p-5 rise" style={{ ["--i" as string]: 2 }} aria-labelledby="comp-h">
          <h3 id="comp-h" className="text-sm font-semibold" style={sans}>{v.company}</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">{v.companyType}</dt><dd>{v.types[ev.company_type ?? "unknown"]}</dd></div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{v.compReliability}</dt>
              <dd><span className={`chip ${ev.comp_reliability === "high" ? "chip-success" : ev.comp_reliability === "low" ? "chip-danger" : ev.comp_reliability === "medium" ? "chip-saffron" : ""}`}>{v.reliability[ev.comp_reliability ?? "unknown"]}</span></dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">{v.reliabilityHint[ev.comp_reliability ?? "unknown"]}</p>
          {ev.comp_reliability && ev.comp_reliability !== "unknown" && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{v.askHr}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-2">{v.hrQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
            </>
          )}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {ev.level_plan && (
          <section className="card p-5 rise" style={{ ["--i" as string]: 3 }} aria-labelledby="lvl-h">
            <h3 id="lvl-h" className="text-sm font-semibold" style={sans}>{v.levelPlan}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{ev.level_plan}</p>
          </section>
        )}
        {ev.cv_changes && ev.cv_changes.length > 0 && (
          <section className="card p-5 rise" style={{ ["--i" as string]: 4 }} aria-labelledby="cvc-h">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="cvc-h" className="text-sm font-semibold" style={sans}>{v.cvChanges}</h3>
              {docsHref ? (
                <Link href={docsHref} className="btn btn-secondary btn-sm"><FileText size={14} aria-hidden="true" /> {v.applyToCv}</Link>
              ) : (
                <span className="text-xs text-muted">{v.trackFirst}</span>
              )}
            </div>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-2">{ev.cv_changes.map((c) => <li key={c}>{c}</li>)}</ol>
          </section>
        )}
      </div>
    </div>
  );
}

function MarginalsToggle({ on, label }: { on: boolean; label: string }) {
  const [checked, setChecked] = useOptimistic(on);
  const [pending, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={checked} disabled={pending}
        onChange={(e) => { const next = e.target.checked; start(async () => { setChecked(next); await setTriageMarginals(next); }); }} />
      {label}
    </label>
  );
}
