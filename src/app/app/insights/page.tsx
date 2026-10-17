import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Lightbulb } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getInsights } from "@/lib/repo/insights";
import { EmptyState } from "@/components/kit";
import { Bars, ChartCard, HBars } from "@/components/insights/charts";
import { BenchmarksCard, BlockersCard, CalibrationCard, OutcomesCard, SilentCard } from "@/components/insights/calibration";
import { scoreColor } from "@/components/ui";
import type { JobType, SourceKind } from "@/lib/types";

export const metadata: Metadata = { title: "Insights" };

const RANGES = { "30": 30, "90": 90, all: null } as const;
const VERDICT_COLORS = ["var(--score-5)", "var(--score-4)", "var(--score-3)", "var(--score-1)"];

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const rk = (typeof sp.range === "string" && sp.range in RANGES ? sp.range : "90") as keyof typeof RANGES;
  const { t, locale } = await getDict();
  const m = t.insights2.ins;
  const d = getInsights(RANGES[rk]);
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  const n1 = (v: number) => v.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const tabs = [
    { key: "30", href: "/app/insights?range=30", label: m.ranges.d30 },
    { key: "90", href: "/app/insights?range=90", label: m.ranges.d90 },
    { key: "all", href: "/app/insights?range=all", label: m.ranges.all },
  ];
  const typeName = (k: string) => t.jobTypes[k as JobType] ?? k;
  const srcName = (k: string) => m.srcNames[k as SourceKind] ?? k;
  const weekLabel = (k: string) => new Date(`${k}T00:00`).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short" });
  const binLabels = Array.from({ length: 8 }, (_, i) => (1 + i / 2).toFixed(1).replace(".", locale === "fr" ? "," : "."));

  const header = (
    <header className="mb-[18px] flex flex-wrap items-end justify-between gap-4 rise">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] leading-[1.1] tracking-[-0.025em] sm:text-[2rem]">{m.title}</h1>
        <p className="mt-1.5 text-muted">{m.lead}</p>
      </div>
      <nav aria-label={m.range} className="seg">
        {tabs.map((x) => (
          <Link key={x.key} href={x.href} aria-current={rk === x.key ? "page" : undefined} className="seg-btn">
            {x.label}
          </Link>
        ))}
      </nav>
    </header>
  );

  if (d.totals.jobs === 0 && d.totals.apps === 0 && rk === "all") {
    return (
      <>
        {header}
        <EmptyState icon={<BarChart3 aria-hidden="true" />} title={m.emptyTitle} hint={m.emptyHint}>
          <Link href="/app/jobs" className="btn btn-primary btn-lg">{t.nav.jobs}</Link>
          <Link href="/app/sources" className="btn btn-outline btn-lg">{t.nav.sources}</Link>
        </EmptyState>
      </>
    );
  }

  const tk = d.takeaways.map((x) => {
    const vars = x.key === "typeRate" ? { ...x.vars, a: typeName(String(x.vars.a)), b: typeName(String(x.vars.b)) } : x.vars;
    return { key: x.key, text: fmt(m.tk[x.key], vars) };
  });
  const funnelMax = Math.max(1, d.funnel[0].count);
  const perWeekTotal = d.perWeek.reduce((s, x) => s + x, 0);

  return (
    <>
      {header}

      {tk.length > 0 && (
        <div className="mb-[18px] grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tk.slice(0, 4).map((x, i) => (
            <div key={x.key} className="card flex gap-2.5 px-4 py-3.5 rise" style={{ ["--i" as string]: i }}>
              <Lightbulb size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-saffron" />
              <p className="text-[0.85rem] leading-[1.45] text-ink-2">{x.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <ChartCard
          id="funnel"
          title={`${m.funnel} · ${rk === "all" ? m.ranges.all : m.ranges[rk === "30" ? "d30" : "d90"]}`}
          desc={m.funnelDesc}
          summary={d.funnel.map((f) => `${t.states[f.stage]} ${f.count}${f.conv !== null ? ` (${f.conv}%)` : ""}`).join(", ")}
          head={[m.stage, m.count, m.conversion]}
          rows={d.funnel.map((f) => [t.states[f.stage], f.count, pct(f.conv)])}
          showData={m.showData}
          i={1}
        >
          <HBars
            max={funnelMax}
            labelWidth="6rem"
            rows={d.funnel.map((f, i) => ({
              label: t.states[f.stage],
              value: f.count,
              display: f.count,
              note: i > 0 ? pct(f.conv) : undefined,
              tone: `color-mix(in srgb, var(--accent) ${100 - i * 11}%, var(--surface-3))`,
            }))}
          />
        </ChartCard>

        <ChartCard
          id="weeks"
          title={m.perWeek}
          desc={fmt(m.perWeekLead, { n: perWeekTotal, w: d.perWeek.length })}
          summary={d.weekLabels.map((w, i) => `${weekLabel(w)}: ${d.perWeek[i]}`).join(", ")}
          head={[m.week, m.applied]}
          rows={d.weekLabels.map((w, i) => [weekLabel(w), d.perWeek[i]])}
          showData={m.showData}
          i={2}
        >
          {d.perWeek.some(Boolean) ? <Bars values={d.perWeek} labels={d.weekLabels.map(weekLabel)} height={120} highlightLast /> : <p className="text-sm text-muted">{m.noData}</p>}
        </ChartCard>

        <ChartCard
          id="verdicts"
          title={m.verdicts}
          desc={fmt(m.scoredN, { n: d.totals.evaluated })}
          summary={d.verdicts.map((v) => `${t.verdicts[v.verdict]} ${v.n}`).join(", ")}
          head={[m.verdict, m.n]}
          rows={d.verdicts.map((v) => [t.verdicts[v.verdict], v.n])}
          showData={m.showData}
          i={3}
        >
          {d.totals.evaluated ? (
            <>
              <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
                {d.verdicts.map((v, i) => (
                  <span key={v.verdict} style={{ flex: v.n || 0.0001, background: VERDICT_COLORS[i], transition: "flex .9s cubic-bezier(.2,.7,.2,1)" }} />
                ))}
              </div>
              <ul className="mt-3 flex flex-col gap-1.5 text-[0.82rem]">
                {d.verdicts.map((v, i) => (
                  <li key={v.verdict} className="flex items-center gap-2">
                    <span className="size-[9px] rounded-[2px]" style={{ background: VERDICT_COLORS[i] }} />
                    <span className="flex-1 text-ink-2">{t.verdicts[v.verdict]}</span>
                    <span className="mono text-[0.75rem] tabular">{v.n}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">{m.noData}</p>
          )}
        </ChartCard>

        <ChartCard
          id="by-source"
          title={m.bySource}
          desc={m.bySourceLead}
          summary={d.bySource.map((s) => `${srcName(s.key)} ${s.avg}`).join(", ") || m.noData}
          head={[m.source, m.avg, m.n]}
          rows={d.bySource.map((s) => [srcName(s.key), n1(s.avg), s.n])}
          showData={m.showData}
          i={4}
          className="lg:col-span-2"
        >
          {d.bySource.length ? (
            <HBars max={5} rows={d.bySource.map((s) => ({ label: srcName(s.key), value: s.avg, display: n1(s.avg), note: `n=${s.n}`, tone: scoreColor(s.avg) }))} />
          ) : (
            <p className="text-sm text-muted">{m.noData}</p>
          )}
        </ChartCard>

        <ChartCard
          id="outcomes"
          title={m.outcomes}
          desc={m.outcomesDesc}
          summary={d.buckets.map((b) => `${m.buckets[b.bucket]}: ${pct(b.rate)} (${b.interviews}/${b.applied})`).join(", ")}
          head={[m.bucket, m.applied, m.interviews, m.rate, m.responseRate]}
          rows={d.buckets.map((b) => [m.buckets[b.bucket], b.applied, b.interviews, pct(b.rate), pct(b.responseRate)])}
          showData={m.showData}
          i={5}
        >
          {d.buckets.some((b) => b.applied) ? (
            <>
              <HBars
                max={100}
                labelWidth="5rem"
                rows={d.buckets.map((b) => ({
                  label: m.buckets[b.bucket],
                  value: b.rate ?? 0,
                  display: pct(b.rate),
                  note: `${b.interviews}/${b.applied}`,
                  tone: scoreColor(b.bucket === "high" ? 4.2 : b.bucket === "mid" ? 3.5 : 2),
                }))}
              />
              {d.calibration.verdict === "separating" && <p className="mt-3 text-[0.78rem] font-semibold text-success">{t.insights2.calib.verdicts.separating}</p>}
            </>
          ) : (
            <p className="text-sm text-muted">{m.noData}</p>
          )}
        </ChartCard>

        <ChartCard
          id="hist"
          title={m.scores}
          desc={m.scoresDesc}
          summary={binLabels.map((b, i) => `${b}: ${d.histogram[i]}`).join(", ")}
          head={[m.scoreRange, m.n]}
          rows={binLabels.map((b, i) => [`${b}–${(1.5 + i / 2).toFixed(1)}`, d.histogram[i]])}
          showData={m.showData}
          i={6}
        >
          {d.totals.evaluated ? <Bars values={d.histogram} labels={binLabels} height={110} tone="var(--score-4)" /> : <p className="text-sm text-muted">{m.noData}</p>}
        </ChartCard>

        <ChartCard
          id="by-type"
          title={m.byType}
          summary={d.byType.map((s) => `${typeName(s.key)} ${s.avg}`).join(", ") || m.noData}
          head={[m.type, m.avg, m.n]}
          rows={d.byType.map((s) => [typeName(s.key), n1(s.avg), s.n])}
          showData={m.showData}
          i={7}
        >
          {d.byType.length ? (
            <HBars max={5} labelWidth="8rem" rows={d.byType.map((s) => ({ label: typeName(s.key), value: s.avg, display: n1(s.avg), note: `n=${s.n}`, tone: scoreColor(s.avg) }))} />
          ) : (
            <p className="text-sm text-muted">{m.noData}</p>
          )}
        </ChartCard>

        <ChartCard
          id="skills"
          title={m.skills}
          desc={m.skillsDesc}
          summary={d.skills.map((s) => `${s.skill} ${s.demand} (${s.have ? m.youHave : m.youLack})`).join(", ") || m.noData}
          head={[m.skill, m.demand, t.insights2.skills.status]}
          rows={d.skills.map((s) => [s.skill, s.demand, s.have ? m.youHave : m.youLack])}
          showData={m.showData}
          i={8}
        >
          {d.skills.length ? (
            <>
              <HBars rows={d.skills.map((s) => ({ label: s.skill, value: s.demand, display: s.demand, tone: s.have ? "var(--accent)" : "var(--saffron)" }))} />
              <p className="mt-3 flex gap-4 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-accent" />{m.youHave}</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--saffron)" }} />{m.youLack}</span>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">{m.noData}</p>
          )}
        </ChartCard>

        <CalibrationCard t={t} bands={d.calibration.bands} verdict={d.calibration.verdict} n={d.calibration.n} i={9} />
        <BenchmarksCard t={t} you={d.you} dayUnit={locale === "fr" ? "j" : "d"} i={10} />
        <SilentCard t={t} silent={d.silent} i={11} />
        <BlockersCard t={t} blockers={d.blockers} i={12} />
        <OutcomesCard t={t} id="out-source" title={t.insights2.calib.bySource} rows={d.bySourceOutcome} name={srcName} i={13} />
        <OutcomesCard t={t} id="out-field" title={t.insights2.calib.byField} rows={d.byFieldOutcome} name={(k) => t.insights2.calib.fields[k as keyof typeof t.insights2.calib.fields] ?? k} i={14} />
      </div>
    </>
  );
}
