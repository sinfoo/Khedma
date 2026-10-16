import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Lightbulb } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getInsights } from "@/lib/repo/insights";
import { EmptyState, LinkTabs, PageHeader, Stat } from "@/components/kit";
import { Bars, ChartCard, HBars } from "@/components/insights/charts";
import { BenchmarksCard, BlockersCard, CalibrationCard, OutcomesCard, SilentCard } from "@/components/insights/calibration";
import { scoreColor } from "@/components/ui";
import type { JobType, SourceKind } from "@/lib/types";

export const metadata: Metadata = { title: "Insights" };

const RANGES = { "30": 30, "90": 90, all: null } as const;

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

  if (d.totals.jobs === 0 && d.totals.apps === 0 && rk === "all") {
    return (
      <>
        <PageHeader title={m.title} lead={m.lead} />
        <EmptyState icon={<BarChart3 size={22} aria-hidden="true" />} title={m.emptyTitle} hint={m.emptyHint}>
          <Link href="/app/jobs" className="btn btn-primary">{t.nav.jobs}</Link>
          <Link href="/app/sources" className="btn btn-secondary">{t.nav.sources}</Link>
        </EmptyState>
      </>
    );
  }

  const tk = d.takeaways.map((x) => {
    const vars = x.key === "typeRate" ? { ...x.vars, a: typeName(String(x.vars.a)), b: typeName(String(x.vars.b)) } : x.vars;
    return { key: x.key, text: fmt(m.tk[x.key], vars) };
  });
  const funnelMax = Math.max(1, d.funnel[0].count);

  return (
    <>
      <PageHeader title={m.title} lead={m.lead} />
      <LinkTabs label={m.range} tabs={tabs} current={rk} />

      <section className="card mb-6 p-5 rise" aria-labelledby="tk-h" style={{ ["--i" as string]: 1 }}>
        <h2 id="tk-h" className="flex items-center gap-2 text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
          <Lightbulb size={16} aria-hidden="true" className="text-saffron" /> {m.takeaways}
        </h2>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {tk.map((x) => (
            <li key={x.key} className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-sm text-ink-2">{x.text}</li>
          ))}
        </ul>
      </section>

      <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={m.responseRate} value={pct(d.response.rate)} hint={fmt(m.appliedN, { n: d.response.applied })} i={2} />
        <Stat label={m.medianReply} value={d.response.medianDays ?? "—"} i={3} />
        <Stat label={t.dashboard.kpis.evaluated} value={d.totals.evaluated} i={4} />
        <Stat label={m.perWeek} value={d.perWeek.reduce((s, x) => s + x, 0)} trend={d.perWeek} hint={m.perWeekDesc} i={5} />
      </dl>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          id="funnel"
          title={m.funnel}
          desc={m.funnelDesc}
          summary={d.funnel.map((f) => `${t.states[f.stage]} ${f.count}${f.conv !== null ? ` (${f.conv}%)` : ""}`).join(", ")}
          head={[m.stage, m.count, m.conversion]}
          rows={d.funnel.map((f) => [t.states[f.stage], f.count, pct(f.conv)])}
          showData={m.showData}
          i={6}
        >
          <HBars
            max={funnelMax}
            labelWidth="6.5rem"
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
          desc={m.perWeekDesc}
          summary={d.weekLabels.map((w, i) => `${weekLabel(w)}: ${d.perWeek[i]}`).join(", ")}
          head={[m.week, m.applied]}
          rows={d.weekLabels.map((w, i) => [weekLabel(w), d.perWeek[i]])}
          showData={m.showData}
          i={7}
        >
          {d.perWeek.some(Boolean) ? <Bars values={d.perWeek} labels={d.weekLabels.map(weekLabel)} highlightLast /> : <p className="text-sm text-muted">{m.noData}</p>}
        </ChartCard>

        <ChartCard
          id="hist"
          title={m.scores}
          desc={m.scoresDesc}
          summary={binLabels.map((b, i) => `${b}: ${d.histogram[i]}`).join(", ")}
          head={[m.scoreRange, m.n]}
          rows={binLabels.map((b, i) => [`${b}–${(1.5 + i / 2).toFixed(1)}`, d.histogram[i]])}
          showData={m.showData}
          i={8}
        >
          {d.totals.evaluated ? <Bars values={d.histogram} labels={binLabels} tone="var(--score-4)" /> : <p className="text-sm text-muted">{m.noData}</p>}
        </ChartCard>

        <ChartCard
          id="outcomes"
          title={m.outcomes}
          desc={m.outcomesDesc}
          summary={d.buckets.map((b) => `${m.buckets[b.bucket]}: ${pct(b.rate)} (${b.interviews}/${b.applied})`).join(", ")}
          head={[m.bucket, m.applied, m.interviews, m.rate, m.responseRate]}
          rows={d.buckets.map((b) => [m.buckets[b.bucket], b.applied, b.interviews, pct(b.rate), pct(b.responseRate)])}
          showData={m.showData}
          i={9}
        >
          {d.buckets.some((b) => b.applied) ? (
            <HBars
              max={100}
              labelWidth="6.5rem"
              rows={d.buckets.map((b) => ({
                label: m.buckets[b.bucket],
                value: b.rate ?? 0,
                display: pct(b.rate),
                note: `${b.interviews}/${b.applied}`,
                tone: scoreColor(b.bucket === "high" ? 4.2 : b.bucket === "mid" ? 3.5 : 2),
              }))}
            />
          ) : (
            <p className="text-sm text-muted">{m.noData}</p>
          )}
        </ChartCard>

        <ChartCard
          id="by-source"
          title={m.bySource}
          summary={d.bySource.map((s) => `${srcName(s.key)} ${s.avg}`).join(", ") || m.noData}
          head={[m.source, m.avg, m.n]}
          rows={d.bySource.map((s) => [srcName(s.key), n1(s.avg), s.n])}
          showData={m.showData}
          i={10}
        >
          {d.bySource.length ? (
            <HBars max={5} rows={d.bySource.map((s) => ({ label: srcName(s.key), value: s.avg, display: n1(s.avg), note: `n=${s.n}`, tone: scoreColor(s.avg) }))} />
          ) : (
            <p className="text-sm text-muted">{m.noData}</p>
          )}
        </ChartCard>

        <ChartCard
          id="by-type"
          title={m.byType}
          summary={d.byType.map((s) => `${typeName(s.key)} ${s.avg}`).join(", ") || m.noData}
          head={[m.type, m.avg, m.n]}
          rows={d.byType.map((s) => [typeName(s.key), n1(s.avg), s.n])}
          showData={m.showData}
          i={11}
        >
          {d.byType.length ? (
            <HBars max={5} labelWidth="10rem" rows={d.byType.map((s) => ({ label: typeName(s.key), value: s.avg, display: n1(s.avg), note: `n=${s.n}`, tone: scoreColor(s.avg) }))} />
          ) : (
            <p className="text-sm text-muted">{m.noData}</p>
          )}
        </ChartCard>

        <ChartCard
          id="verdicts"
          title={m.verdicts}
          summary={d.verdicts.map((v) => `${t.verdicts[v.verdict]} ${v.n}`).join(", ")}
          head={[m.verdict, m.n]}
          rows={d.verdicts.map((v) => [t.verdicts[v.verdict], v.n])}
          showData={m.showData}
          i={12}
        >
          {d.totals.evaluated ? (
            <>
              <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="h-4 w-full overflow-hidden rounded-full">
                {(() => {
                  let x = 0;
                  return d.verdicts.map((v, i) => {
                    const w = (v.n / d.totals.evaluated) * 100;
                    const r = <rect key={v.verdict} x={x} y="0" width={w} height="6" fill={["var(--score-5)", "var(--score-4)", "var(--score-3)", "var(--score-1)"][i]} />;
                    x += w;
                    return r;
                  });
                })()}
              </svg>
              <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
                {d.verdicts.map((v, i) => (
                  <li key={v.verdict} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-sm" style={{ background: ["var(--score-5)", "var(--score-4)", "var(--score-3)", "var(--score-1)"][i] }} />
                    <span className="text-ink-2">{t.verdicts[v.verdict]}</span>
                    <span className="mono ml-auto tabular">{v.n}</span>
                  </li>
                ))}
              </ul>
            </>
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
          i={13}
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

        <CalibrationCard t={t} bands={d.calibration.bands} verdict={d.calibration.verdict} n={d.calibration.n} i={14} />
        <BenchmarksCard t={t} you={d.you} dayUnit={locale === "fr" ? "j" : "d"} i={15} />
        <SilentCard t={t} silent={d.silent} i={16} />
        <BlockersCard t={t} blockers={d.blockers} i={17} />
        <OutcomesCard t={t} id="out-source" title={t.insights2.calib.bySource} rows={d.bySourceOutcome} name={srcName} i={18} />
        <OutcomesCard t={t} id="out-field" title={t.insights2.calib.byField} rows={d.byFieldOutcome} name={(k) => t.insights2.calib.fields[k as keyof typeof t.insights2.calib.fields] ?? k} i={19} />
      </div>
    </>
  );
}
