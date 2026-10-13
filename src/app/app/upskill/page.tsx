import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { getProfile, kvGet, listJobs } from "@/lib/db";
import { computeSkillGaps } from "@/lib/ai";
import type { UpskillPlan } from "@/lib/types";
import { fmt } from "@/lib/i18n/dict";
import { Empty, EngineChip, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { generateUpskillPlan } from "@/app/actions/upskill";

export const metadata: Metadata = { title: "Upskill" };

export default async function UpskillPage() {
  const { t } = await getDict();
  const profile = getProfile();
  const jobs = listJobs().filter((j) => !j.evaluation || j.evaluation.verdict !== "skip");
  const gaps = computeSkillGaps(jobs, profile).slice(0, 30);
  const plan = kvGet<UpskillPlan | null>("upskill_plan", null);
  const max = Math.max(1, ...gaps.map((g) => g.demand));

  return (
    <>
      <PageHeader
        title={t.upskill.title}
        lead={t.upskill.intro}
        actions={
          gaps.length > 0 && (
            <ActionButton action={generateUpskillPlan} pendingLabel={t.common.generating} className="btn btn-primary">
              <Sparkles size={16} aria-hidden="true" /> {plan ? t.common.regenerate : t.upskill.generatePlan}
            </ActionButton>
          )
        }
      />

      {gaps.length === 0 ? (
        <Empty title={t.upskill.empty}>
          <Link href="/app/jobs" className="btn btn-primary">{t.nav.jobs}</Link>
          <Link href="/app/profile" className="btn btn-secondary">{t.nav.profile}</Link>
        </Empty>
      ) : (
        <div className="grid lg:grid-cols-[420px_1fr] gap-6 items-start">
          <section className="card p-5 rise" aria-labelledby="heat-h" style={{ ["--i" as string]: 1 }}>
            <h2 id="heat-h" className="text-xl mb-1">{t.upskill.heatmap}</h2>
            <p className="hint mb-4">
              <span className="inline-block size-2.5 rounded-sm bg-accent align-middle mr-1" aria-hidden="true" /> {t.upskill.have}
              <span className="inline-block size-2.5 rounded-sm bg-saffron align-middle ml-3 mr-1" aria-hidden="true" /> {t.upskill.missing}
            </p>
            <ul className="space-y-1.5">
              {gaps.map((g) => (
                <li key={g.skill} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2 text-sm">
                  <span className="truncate" title={g.skill}>{g.skill}</span>
                  <span className="h-4 rounded-sm bg-surface-2 overflow-hidden" aria-hidden="true">
                    <span className="block h-full rounded-sm" style={{ width: `${(g.demand / max) * 100}%`, background: g.have ? "var(--accent)" : "var(--saffron)", opacity: 0.4 + 0.6 * (g.demand / max) }} />
                  </span>
                  <span className="mono text-xs text-muted">
                    <span aria-hidden="true">{g.demand}</span>
                    <span className="sr-only">{fmt(t.upskill.offersMention, { n: g.demand })}</span>
                  </span>
                  <span className="sr-only">{g.have ? t.upskill.have : t.upskill.missing}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="plan-h" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 id="plan-h" className="text-xl">{t.upskill.plan}</h2>
              {plan && <EngineChip engine={plan.engine} t={t} />}
            </div>
            {!plan ? (
              <p className="text-muted">{t.upskill.generatePlan} →</p>
            ) : (
              <ol className="space-y-4">
                {plan.plan.map((p, i) => (
                  <li key={p.skill} className="card p-5 rise" style={{ ["--i" as string]: i + 1 }}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-semibold">{p.skill}</h3>
                      <span className={`chip ${p.priority === 1 ? "chip-danger" : p.priority === 2 ? "chip-saffron" : ""}`}>
                        {t.upskill.priority} {p.priority}
                      </span>
                    </div>
                    <p className="text-sm text-ink-2 mt-1">{p.why}</p>
                    <div className="grid sm:grid-cols-2 gap-4 mt-4">
                      <div>
                        <h4 className="text-xs uppercase tracking-wide font-semibold text-muted mb-1">{t.upskill.steps}</h4>
                        <ol className="list-decimal pl-5 text-sm space-y-1">{p.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
                      </div>
                      <div>
                        <h4 className="text-xs uppercase tracking-wide font-semibold text-muted mb-1">{t.upskill.resources}</h4>
                        <ul className="text-sm space-y-1">
                          {p.resources.map((r) => (
                            <li key={r.url}>
                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{r.title}</a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </>
  );
}
