"use client";

import { useMemo, useState, useTransition } from "react";
import { BadgeCheck, BookOpen, Check, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
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

  const isDone = (skill: string, i: number, base: number[]) => over[`${skill}|${i}`] ?? base.includes(i);
  const totalSteps = plan?.items.reduce((s, p) => s + p.steps.length, 0) ?? 0;
  const doneSteps = plan?.items.reduce((s, p) => s + p.steps.filter((_, i) => isDone(p.skill, i, p.done) || acquiredNow[p.skill]).length, 0) ?? 0;

  const PR = { 1: { label: m.priorityShort[1], cls: "bg-danger-soft text-danger" }, 2: { label: m.priorityShort[2], cls: "bg-saffron-soft text-saffron" }, 3: { label: m.priorityShort[3], cls: "bg-surface-2 text-ink-2" } } as const;
  const ringR = 18;
  const ringC = 2 * Math.PI * ringR;
  const val = (r: Matrix["rows"][number]) => (type ? r.byType[type] ?? 0 : r.total);
  const demandMax = Math.max(1, ...rows.map(val));

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <section className="flex min-w-0 flex-col gap-2.5" aria-labelledby="plan-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 id="plan-h" className="text-[1.2rem] tracking-[-0.015em]">{m.plan}</h2>
            {plan && <EngineChip engine={plan.engine} t={t} />}
          </div>
          <button
            type="button"
            className="btn btn-saffron"
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
            <Sparkles size={15} aria-hidden="true" /> {pending ? m.generating : plan ? m.regenerate : m.generate}
          </button>
        </div>
        {plan ? (
          <p className="text-[0.8rem] text-muted tabular">{fmt(m.progress, { done: doneSteps, n: totalSteps })} · {m.overall}</p>
        ) : (
          <p className="card p-5 text-sm text-muted">{m.planEmpty}</p>
        )}

        {plan &&
          plan.items.map((p, k) => {
            const acquired = p.acquired || !!acquiredNow[p.skill];
            const done = p.steps.filter((_, i) => acquired || isDone(p.skill, i, p.done)).length;
            const complete = done === p.steps.length;
            const pct = p.steps.length ? done / p.steps.length : 0;
            return (
              <article key={p.skill} className="card px-[18px] py-4 rise" style={{ ["--i" as string]: k }} aria-labelledby={`sk-${k}`}>
                <div className="flex items-start gap-3">
                  <span role="img" aria-label={`${p.skill}: ${fmt(m.progress, { done, n: p.steps.length })}`} className="relative grid size-11 shrink-0 place-items-center">
                    <svg viewBox="0 0 44 44" width="44" height="44" className="-rotate-90" aria-hidden="true">
                      <circle cx="22" cy="22" r={ringR} fill="none" stroke="var(--surface-3)" strokeWidth="5" />
                      <circle cx="22" cy="22" r={ringR} fill="none" stroke={complete ? "var(--success)" : "var(--accent)"} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${ringC * pct} ${ringC}`} style={{ transition: "stroke-dasharray .8s cubic-bezier(.2,.7,.2,1)" }} />
                    </svg>
                    <span className="mono absolute text-[0.68rem] font-semibold">{done}/{p.steps.length}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 id={`sk-${k}`} className="text-[1.1rem] tracking-[-0.01em]">{p.skill}</h3>
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-px text-[0.68rem] font-semibold ${PR[p.priority].cls}`}>{PR[p.priority].label}</span>
                      {acquired && <span className="chip chip-success !py-0 text-[0.68rem]"><BadgeCheck size={11} aria-hidden="true" /> {m.acquired}</span>}
                      <span className="ml-auto whitespace-nowrap text-[0.75rem] text-muted">{fmt(m.weeks, { n: Math.max(1, p.steps.length) })}</span>
                    </div>
                    <p className="mt-0.5 text-[0.82rem] text-muted">{p.why}</p>
                  </div>
                </div>
                <ol className="mt-3 flex flex-col gap-1.5">
                  {p.steps.map((s, i) => {
                    const checked = acquired || isDone(p.skill, i, p.done);
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          disabled={acquired}
                          className={`flex w-full items-center gap-2.5 rounded-[10px] border border-line px-2.5 py-2 text-left transition-colors ${checked ? "bg-success-soft/40" : "bg-surface hover:bg-surface-2"}`}
                          onClick={() => {
                            const v = !checked;
                            setOver((o) => ({ ...o, [`${p.skill}|${i}`]: v }));
                            start(async () => {
                              await toggleStep(p.skill, i, v);
                              toast.success(v ? m.stepDone : m.stepUndone);
                            });
                          }}
                        >
                          <span aria-hidden="true" className={`grid size-[18px] shrink-0 place-items-center rounded-md border text-white ${checked ? "border-success bg-success" : "border-line-strong bg-surface"}`}>
                            {checked && <Check size={11} />}
                          </span>
                          <span className={`flex-1 text-[0.85rem] ${checked ? "text-muted line-through" : "text-ink"}`}>{s}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {p.resources.map((r) => (
                    <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-full border border-line bg-surface-2 px-2.5 text-[0.72rem] font-semibold text-ink-2 hover:border-line-strong">
                      <BookOpen size={11} aria-hidden="true" /> {r.title}
                      <span className="sr-only"> ({m.external})</span>
                    </a>
                  ))}
                  {!acquired && (
                    <button
                      type="button"
                      className={`btn btn-sm ml-auto ${complete ? "btn-primary" : "btn-outline"}`}
                      disabled={pending}
                      onClick={() => {
                        setAcquiredNow((a) => ({ ...a, [p.skill]: true }));
                        start(async () => {
                          await markSkillAcquired(p.skill);
                          toast.success(fmt(m.acquiredToast, { skill: p.skill }));
                        });
                      }}
                    >
                      <BadgeCheck size={13} aria-hidden="true" /> {m.acquire}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
      </section>

      <aside className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-[76px]">
        <section className="card p-4" aria-labelledby="heat-h">
          <h2 id="heat-h" className="card-title text-[0.9rem]">{m.demand}</h2>
          <p className="mt-0.5 mb-3 text-[0.75rem] text-muted">{m.demandLegend}</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <select className="input !h-7 !w-auto !py-0 text-[0.78rem]" aria-label={m.filterType} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{m.allTypes}</option>
              {matrix.types.map((ty) => <option key={ty} value={ty}>{t.jobTypes[ty]}</option>)}
            </select>
            <span role="radiogroup" aria-label={m.filterHave} className="seg seg-sm">
              {(["all", "missing", "have"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={show === k} className={`seg-btn ${show === k ? "on" : ""}`} onClick={() => setShow(k)}>{m.show[k]}</button>
              ))}
            </span>
          </div>
          {rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted" aria-live="polite">{m.noRows}</p>
          ) : (
            <ul className="flex flex-col gap-[7px]">
              {rows.slice(0, 14).map((r) => (
                <li key={r.skill} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2.5 text-[0.8rem]">
                  <span className="truncate text-ink-2" title={r.skill}>{r.skill}</span>
                  <span className="block h-2.5 overflow-hidden rounded-[5px] bg-surface-2">
                    <span className="block h-full rounded-[5px]" style={{ width: `${(val(r) / demandMax) * 100}%`, background: r.have ? "var(--accent)" : "var(--saffron)", transition: "width .9s cubic-bezier(.2,.7,.2,1)" }} />
                  </span>
                  <span className="mono text-[0.72rem] text-muted tabular">{val(r)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
