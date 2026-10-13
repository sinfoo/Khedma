"use client";

import { useMemo, useState, useTransition } from "react";
import { BadgeCheck, ExternalLink, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { Progress } from "@/components/kit";
import { EngineChip } from "@/components/ui";
import { generateUpskillPlan, markSkillAcquired, toggleStep } from "@/app/actions/upskill";
import type { JobType } from "@/lib/types";

export interface PlanView {
  engine: string;
  items: { skill: string; priority: 1 | 2 | 3; why: string; steps: string[]; done: number[]; acquired: boolean; resources: { title: string; url: string }[] }[];
}

interface Matrix {
  types: JobType[];
  rows: { skill: string; have: boolean; total: number; byType: Record<string, number> }[];
}

export function UpskillBoard({ matrix, plan }: { matrix: Matrix; plan: PlanView | null }) {
  const { t } = useT();
  const m = t.insights2.skills;
  const toast = useToast();
  const [type, setType] = useState<string>("");
  const [show, setShow] = useState<"all" | "missing" | "have">("all");
  const [pending, start] = useTransition();
  // Optimistic step state: "skill|i" -> done
  const [over, setOver] = useState<Record<string, boolean>>({});
  const [acquiredNow, setAcquiredNow] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    const val = (r: Matrix["rows"][number]) => (type ? r.byType[type] ?? 0 : r.total);
    return matrix.rows
      .filter((r) => val(r) > 0 && (show === "all" || (show === "have" ? r.have : !r.have)))
      .sort((a, b) => val(b) - val(a) || a.skill.localeCompare(b.skill));
  }, [matrix.rows, type, show]);
  const cols = type ? [type] : matrix.types;
  const max = Math.max(1, ...matrix.rows.flatMap((r) => cols.map((c) => r.byType[c] ?? 0)));

  const isDone = (skill: string, i: number, base: number[]) => over[`${skill}|${i}`] ?? base.includes(i);
  const totalSteps = plan?.items.reduce((s, p) => s + p.steps.length, 0) ?? 0;
  const doneSteps = plan?.items.reduce((s, p) => s + p.steps.filter((_, i) => isDone(p.skill, i, p.done) || acquiredNow[p.skill]).length, 0) ?? 0;

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="card p-5 rise min-w-0" style={{ ["--i" as string]: 1 }} aria-labelledby="heat-h">
        <h2 id="heat-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{m.heatmap}</h2>
        <p className="mt-0.5 text-xs text-muted">{m.heatmapDesc}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="sk-type" className="label">{m.filterType}</label>
            <select id="sk-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{m.allTypes}</option>
              {matrix.types.map((ty) => <option key={ty} value={ty}>{t.jobTypes[ty]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sk-show" className="label">{m.filterHave}</label>
            <select id="sk-show" className="input" value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
              {(["all", "missing", "have"] as const).map((k) => <option key={k} value={k}>{m.show[k]}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4 max-h-[34rem] overflow-auto">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted" aria-live="polite">{m.noRows}</p>
          ) : (
            <table className="w-full border-separate border-spacing-y-1 text-sm">
              <caption className="sr-only">{m.heatmap}</caption>
              <thead className="sticky top-0 bg-surface">
                <tr className="text-xs text-muted">
                  <th scope="col" className="py-1 pr-2 text-left font-medium">{t.insights2.ins.skill}</th>
                  {cols.map((c) => <th key={c} scope="col" className="px-1 py-1 text-center font-medium" title={t.jobTypes[c as JobType]}>{/\(([^)]+)\)/.exec(t.jobTypes[c as JobType])?.[1] ?? t.jobTypes[c as JobType]}</th>)}
                  {!type && <th scope="col" className="py-1 pl-1 text-right font-medium">{m.total}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.skill}>
                    <th scope="row" className="max-w-[9rem] py-0.5 pr-2 text-left font-normal">
                      <span className="flex items-center gap-1.5 max-sm:flex-row-reverse max-sm:justify-end">
                        <span className="truncate">{r.skill}</span>
                        <span className={`chip !px-1.5 !py-0 text-[0.68rem] max-sm:sr-only ${r.have ? "chip-accent" : "chip-saffron"}`}>{r.have ? m.have : m.missing}</span>
                        <span aria-hidden="true" className="size-2 shrink-0 rounded-full sm:hidden" style={{ background: r.have ? "var(--accent)" : "var(--saffron)" }} />
                      </span>
                    </th>
                    {cols.map((c) => {
                      const v = r.byType[c] ?? 0;
                      return (
                        <td key={c} className="px-1 text-center">
                          <span
                            className="inline-flex h-7 w-full min-w-9 items-center justify-center rounded-md text-xs tabular text-ink"
                            style={{ background: v ? `color-mix(in srgb, ${r.have ? "var(--accent)" : "var(--saffron)"} ${12 + Math.round((v / max) * 48)}%, transparent)` : "var(--surface-2)" }}
                          >
                            {v || <span className="text-muted">·</span>}
                          </span>
                        </td>
                      );
                    })}
                    {!type && <td className="mono pl-1 text-right tabular">{r.total}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="min-w-0 space-y-4" aria-labelledby="plan-h">
        <div className="card p-5 rise" style={{ ["--i" as string]: 2 }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 id="plan-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{m.plan}</h2>
              {plan && <EngineChip engine={plan.engine} t={t} />}
            </div>
            <button
              type="button"
              className={`btn ${plan ? "btn-secondary" : "btn-primary"} btn-sm`}
              disabled={pending}
              aria-busy={pending}
              onClick={() =>
                start(async () => {
                  await generateUpskillPlan();
                  setOver({});
                  toast.success(m.generated);
                })
              }
            >
              <Sparkles size={14} aria-hidden="true" /> {pending ? m.generating : plan ? m.regenerate : m.generate}
            </button>
          </div>
          {plan ? (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs text-muted">
                <span>{m.overall}</span>
                <span className="tabular">{fmt(m.progress, { done: doneSteps, n: totalSteps })}</span>
              </div>
              <Progress value={doneSteps} max={Math.max(1, totalSteps)} label={m.overall} tone={doneSteps === totalSteps && totalSteps ? "success" : "accent"} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">{m.planEmpty}</p>
          )}
        </div>

        {plan && (
          <ol className="relative space-y-4 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-line">
            {plan.items.map((p, k) => {
              const acquired = p.acquired || !!acquiredNow[p.skill];
              const done = p.steps.filter((_, i) => acquired || isDone(p.skill, i, p.done)).length;
              const complete = done === p.steps.length;
              return (
                <li key={p.skill} className="relative pl-11 rise" style={{ ["--i" as string]: k + 3 }}>
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-4 grid size-8 place-items-center rounded-full border text-sm font-semibold ${
                      acquired ? "border-success bg-success-soft text-success" : "border-line-strong bg-surface text-ink-2"
                    }`}
                  >
                    {acquired ? <BadgeCheck size={16} /> : k + 1}
                  </span>
                  <article className="card p-5" aria-labelledby={`sk-${k}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 id={`sk-${k}`} className="text-lg">{p.skill}</h3>
                        <p className="mt-0.5 text-sm text-ink-2">{p.why}</p>
                      </div>
                      <span className={`chip ${p.priority === 1 ? "chip-danger" : p.priority === 2 ? "chip-saffron" : ""}`}>{fmt(m.priority, { n: p.priority })}</span>
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1">
                        <Progress value={done} max={Math.max(1, p.steps.length)} label={`${p.skill}: ${fmt(m.progress, { done, n: p.steps.length })}`} tone={complete ? "success" : "accent"} />
                      </div>
                      <span className="text-xs tabular text-muted">{fmt(m.progress, { done, n: p.steps.length })}</span>
                    </div>

                    <fieldset className="mt-3">
                      <legend className="sr-only">{p.skill}</legend>
                      <ul className="space-y-1">
                        {p.steps.map((s, i) => {
                          const checked = acquired || isDone(p.skill, i, p.done);
                          const id = `st-${k}-${i}`;
                          return (
                            <li key={i}>
                              <label htmlFor={id} className="-mx-2 flex min-h-8 cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                                <input
                                  id={id}
                                  type="checkbox"
                                  className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                                  checked={checked}
                                  disabled={acquired}
                                  onChange={(e) => {
                                    const v = e.target.checked;
                                    setOver((o) => ({ ...o, [`${p.skill}|${i}`]: v }));
                                    start(async () => {
                                      await toggleStep(p.skill, i, v);
                                      toast.success(v ? m.stepDone : m.stepUndone);
                                    });
                                  }}
                                />
                                <span className={checked ? "text-muted line-through" : ""}>{s}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </fieldset>

                    <div className="mt-4 border-t border-line pt-3">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{m.resources}</h4>
                      <ul className="flex flex-wrap gap-1.5">
                        {p.resources.map((r) => (
                          <li key={r.url}>
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="chip hover:border-line-strong hover:text-ink">
                              {r.title} <ExternalLink size={12} aria-hidden="true" />
                              <span className="sr-only"> ({m.external})</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-4 flex justify-end">
                      {acquired ? (
                        <span className="chip chip-success"><BadgeCheck size={13} aria-hidden="true" /> {m.acquired}</span>
                      ) : (
                        <button
                          type="button"
                          className={`btn btn-sm ${complete ? "btn-primary" : "btn-secondary"}`}
                          disabled={pending}
                          onClick={() => {
                            setAcquiredNow((a) => ({ ...a, [p.skill]: true }));
                            start(async () => {
                              await markSkillAcquired(p.skill);
                              toast.success(fmt(m.acquiredToast, { skill: p.skill }));
                            });
                          }}
                        >
                          <BadgeCheck size={14} aria-hidden="true" /> {m.acquire}
                        </button>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
