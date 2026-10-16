// Server-safe insight cards: calibration table, blocker patterns, outcomes by key, benchmarks, silent companies.
import Link from "next/link";
import type { Dict } from "@/lib/i18n/dict";
import { fmt } from "@/lib/i18n/dict";
import { scoreColor } from "@/components/ui";
import { CompanyAvatar } from "@/components/kit";
import { BENCHMARKS, CALIBRATION_MIN_N, type CalibrationBand, type CalibrationVerdict } from "@/lib/reports/digest";
import type { OutcomeRow } from "@/lib/repo/insights";
import { ChartCard, HBars } from "./charts";

const h2 = "text-base font-semibold";
const h2s = { fontFamily: "var(--font-sans)", letterSpacing: 0 } as const;
const pct = (v: number | null, na: string) => (v === null ? na : `${v}%`);

export function CalibrationCard({ t, bands, verdict, n, i }: { t: Dict; bands: CalibrationBand[]; verdict: CalibrationVerdict; n: number; i: number }) {
  const m = t.insights2.calib;
  const tone = verdict === "separating" ? "chip-success" : verdict === "inverted" ? "chip-danger" : verdict === "flat" ? "chip-saffron" : "";
  return (
    <section className="card p-5 rise lg:col-span-2" style={{ ["--i" as string]: i }} aria-labelledby="calib-h">
      <h2 id="calib-h" className={h2} style={h2s}>{m.title}</h2>
      <p className="mt-0.5 text-xs text-muted">{m.desc}</p>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className={`chip ${tone}`}>{verdict}</span>
        <span className="text-ink-2">{fmt(m.verdicts[verdict], { min: CALIBRATION_MIN_N })}</span>
        <span className="mono ml-auto text-xs text-muted tabular">{fmt(m.basedOn, { n })}</span>
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="table w-full text-sm">
          <thead>
            <tr>
              <th scope="col">{m.band}</th>
              <th scope="col" className="!text-right">{m.sent}</th>
              <th scope="col" className="!text-right">{m.interviews}</th>
              <th scope="col" className="!text-right">{m.interviewRate}</th>
              <th scope="col" className="!text-right">{m.offers}</th>
              <th scope="col" className="!text-right">{m.offerRate}</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.band}>
                <th scope="row" className="!font-medium">
                  <span className="inline-block size-2.5 rounded-sm align-middle" style={{ background: scoreColor(b.band === "4.5+" ? 4.6 : b.band === "4.0-4.4" ? 4.1 : b.band === "3.5-3.9" ? 3.6 : 2.5) }} /> {b.band}
                </th>
                <td className="text-right tabular">{b.n}</td>
                <td className="text-right tabular">{b.interviews}</td>
                <td className="text-right tabular">{pct(b.interviewRate, `(${m.tooSmall})`)}</td>
                <td className="text-right tabular">{b.offers}</td>
                <td className="text-right tabular">{pct(b.offerRate, `(${m.tooSmall})`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function BlockersCard({ t, blockers, i }: { t: Dict; blockers: { text: string; n: number; kind: "gap" | "flag" }[]; i: number }) {
  const m = t.insights2.calib;
  return (
    <ChartCard
      id="blockers"
      title={m.blockers}
      desc={m.blockersDesc}
      summary={blockers.map((b) => `${b.text} ${b.n}`).join(", ") || m.noBlockers}
      head={[m.blocker, t.insights2.ins.n]}
      rows={blockers.map((b) => [`${b.text} (${m[b.kind]})`, b.n])}
      showData={t.insights2.ins.showData}
      i={i}
    >
      {blockers.length ? (
        <HBars labelWidth="12rem" rows={blockers.map((b) => ({ label: b.text, value: b.n, display: b.n, note: m[b.kind], tone: b.kind === "flag" ? "var(--danger)" : "var(--saffron)" }))} />
      ) : (
        <p className="text-sm text-muted">{m.noBlockers}</p>
      )}
    </ChartCard>
  );
}

export function OutcomesCard({ t, id, title, rows, name, i }: { t: Dict; id: string; title: string; rows: OutcomeRow[]; name: (k: string) => string; i: number }) {
  const m = t.insights2.calib;
  const na = "—";
  return (
    <ChartCard
      id={id}
      title={title}
      desc={m.outcomesDesc}
      summary={rows.map((r) => `${name(r.key)} ${pct(r.interviewRate, na)}`).join(", ") || t.insights2.ins.noData}
      head={[title, t.insights2.ins.applied, t.insights2.ins.responseRate, t.insights2.ins.rate]}
      rows={rows.map((r) => [name(r.key), r.applied, pct(r.responseRate, na), pct(r.interviewRate, na)])}
      showData={t.insights2.ins.showData}
      i={i}
    >
      {rows.length ? (
        <HBars max={100} labelWidth="8rem" rows={rows.map((r) => ({ label: name(r.key), value: r.interviewRate ?? 0, display: pct(r.interviewRate, na), note: `${r.interviews}/${r.applied}`, tone: "var(--accent)" }))} />
      ) : (
        <p className="text-sm text-muted">{t.insights2.ins.noData}</p>
      )}
    </ChartCard>
  );
}

export function BenchmarksCard({ t, you, i, dayUnit }: { t: Dict; dayUnit: string; you: { responseRate: number | null; interviewRate: number | null; firstResponseDays: number | null; interviewToOfferDays: number | null; n: number }; i: number }) {
  const m = t.insights2.calib;
  const rows: { key: keyof typeof m.metrics; you: number | null; range: readonly [number, number]; unit: string }[] = [
    { key: "responseRate", you: you.responseRate, range: BENCHMARKS.responseRate, unit: "%" },
    { key: "interviewRate", you: you.interviewRate, range: BENCHMARKS.appToInterview, unit: "%" },
    { key: "firstResponseDays", you: you.firstResponseDays, range: BENCHMARKS.firstResponseDays, unit: "d" },
    { key: "interviewToOfferDays", you: you.interviewToOfferDays, range: BENCHMARKS.interviewToOfferDays, unit: "d" },
  ];
  return (
    <section className="card p-5 rise" style={{ ["--i" as string]: i }} aria-labelledby="bench-h">
      <h2 id="bench-h" className={h2} style={h2s}>{m.bench}</h2>
      <p className="mt-0.5 text-xs text-muted">{fmt(m.benchDesc, { year: BENCHMARKS.year })}</p>
      <table className="table mt-4 w-full text-sm">
        <thead>
          <tr>
            <th scope="col">{m.metric}</th>
            <th scope="col" className="!text-right">{m.you}</th>
            <th scope="col" className="!text-right">{m.typical}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const inRange = r.you !== null && r.you >= r.range[0] && r.you <= r.range[1];
            const above = r.you !== null && r.you > r.range[1];
            // Higher is better for rates, lower is better for delays.
            const good = r.you !== null && (r.unit === "%" ? r.you >= r.range[0] : r.you <= r.range[1]);
            return (
              <tr key={r.key}>
                <th scope="row" className="!font-medium">{m.metrics[r.key]}</th>
                <td className={`text-right tabular font-semibold ${r.you === null ? "text-muted" : good ? "text-success" : above && r.unit === "d" ? "text-danger" : inRange ? "" : "text-saffron"}`}>
                  {r.you === null ? "—" : `${r.you}${r.unit === "%" ? " %" : ` ${dayUnit}`}`}
                </td>
                <td className="text-right tabular text-muted">{r.range[0]}–{r.range[1]}{r.unit === "%" ? " %" : ` ${dayUnit}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted tabular">{fmt(m.basedOn, { n: you.n })}</p>
    </section>
  );
}

export function SilentCard({ t, silent, i }: { t: Dict; silent: { application_id: number; title: string; company: string; days: number }[]; i: number }) {
  const m = t.insights2.calib;
  return (
    <section className="card p-5 rise" style={{ ["--i" as string]: i }} aria-labelledby="silent-h">
      <h2 id="silent-h" className={h2} style={h2s}>{m.silent}</h2>
      <p className="mt-0.5 text-xs text-muted">{m.silentDesc}</p>
      {silent.length ? (
        <ul className="mt-4 divide-y divide-line">
          {silent.map((s) => (
            <li key={s.application_id} className="flex items-center gap-3 py-2">
              <CompanyAvatar name={s.company} size={28} />
              <span className="min-w-0 flex-1">
                <Link href={`/app/pipeline/${s.application_id}?tab=messages`} className="block truncate text-sm font-medium hover:text-accent-text">{s.company}</Link>
                <span className="block truncate text-xs text-muted">{s.title}</span>
              </span>
              <span className="mono text-xs text-muted tabular">{fmt(m.silentDays, { n: s.days })}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">{m.silentEmpty}</p>
      )}
    </section>
  );
}
