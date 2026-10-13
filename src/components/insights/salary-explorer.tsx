"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import {
  DEFAULT_EUR_TND,
  FAMILIES,
  LEVELS,
  REMOTE_EUR,
  SUMMER_UNPAID_SHARE,
  TIERS,
  band,
  grossFromNet,
  netFromGross,
  type Family,
  type Level,
  type Tier,
} from "@/lib/salaries";

const clampNum = (v: string, max: number) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};

export function SalaryExplorer() {
  const { t, locale } = useT();
  const m = t.insights2.sal;
  const nf = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [family, setFamily] = useState<Family>("software");
  const [level, setLevel] = useState<Level>("pfe");
  const [tier, setTier] = useState<Tier>("tunis");
  const [mode, setMode] = useState<"g2n" | "n2g">("g2n");
  const [amount, setAmount] = useState("1800");
  const [rate, setRate] = useState(String(DEFAULT_EUR_TND));
  // The side the user typed in stays verbatim; the other one is derived.
  const [conv, setConv] = useState<{ side: "eur" | "tnd"; v: string }>({ side: "eur", v: "1000" });

  const [lo, hi] = band(family, level, tier);
  const allMax = Math.max(...FAMILIES.map((f) => band(f, level, tier)[1]));
  const fx = clampNum(rate, 100) || DEFAULT_EUR_TND;
  const a = clampNum(amount, 1_000_000);
  const gross = mode === "g2n" ? a : grossFromNet(a);
  const b = netFromGross(gross);
  const isIntern = level !== "junior";
  const other = (v: string, k: number) => (v.trim() === "" ? "" : String(Math.round(clampNum(v, 1e9) * k * 100) / 100));
  const eurVal = conv.side === "eur" ? conv.v : other(conv.v, 1 / fx);
  const tndVal = conv.side === "tnd" ? conv.v : other(conv.v, fx);

  const select = <K extends string>(id: string, label: string, value: K, set: (v: K) => void, keys: readonly K[], names: Record<K, string>) => (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => set(e.target.value as K)}>
        {keys.map((k) => <option key={k} value={k}>{names[k]}</option>)}
      </select>
    </div>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 grid-cols-1 gap-6">
        <section className="card p-5 rise" style={{ ["--i" as string]: 2 }} aria-labelledby="band-h">
          <h2 id="band-h" className="sr-only">{m.filters}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {select("sal-fam", m.family, family, setFamily, FAMILIES, m.families)}
            {select("sal-lvl", m.level, level, setLevel, LEVELS, m.levels)}
            {select("sal-tier", m.tier, tier, setTier, TIERS, m.tiers)}
          </div>

          <div className="mt-5 rounded-2xl bg-surface-2 p-5" aria-live="polite">
            <p className="text-xs font-medium text-muted">{m.families[family]} · {m.levels[level]} · {m.tiers[tier]}</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="display tabular text-4xl">{nf.format(lo)}–{nf.format(hi)}</span>
              <span className="text-muted">{m.perMonth} · {isIntern ? m.gratification : m.gross}</span>
            </p>
            {level === "summer" && <p className="mt-2 text-sm text-ink-2">{fmt(m.unpaidNote, { p: Math.round(SUMMER_UNPAID_SHARE * 100) })}</p>}
            {level === "junior" && (
              <p className="mt-2 text-sm text-ink-2">
                ≈ {nf.format(netFromGross(lo).netMonthly)}–{nf.format(netFromGross(hi).netMonthly)} DT {m.net.toLowerCase()} {m.month}
              </p>
            )}
          </div>

          <h3 className="mt-5 mb-2 text-sm font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{m.bandsTitle}</h3>
          <table className="w-full text-sm">
            <caption className="sr-only">{m.bandsTitle} — {m.levels[level]}, {m.tiers[tier]} ({m.perMonth})</caption>
            <thead className="sr-only">
              <tr><th scope="col">{m.family}</th><th scope="col">{m.perMonth}</th><th scope="col">{m.amount}</th></tr>
            </thead>
            <tbody>
              {FAMILIES.map((f) => {
                const [l, h] = band(f, level, tier);
                return (
                  <tr key={f} className={f === family ? "font-medium" : ""}>
                    <th scope="row" className="w-[42%] py-1 pr-3 text-left font-[inherit] text-ink-2">
                      <button type="button" className="text-left hover:text-accent-text" aria-pressed={f === family} onClick={() => setFamily(f)}>{m.families[f]}</button>
                    </th>
                    <td className="py-1" aria-hidden="true">
                      <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-3 w-full">
                        <rect x="0" y="0" width="100" height="8" rx="2" fill="var(--surface-2)" />
                        <rect x={(l / allMax) * 100} y="0" width={((h - l) / allMax) * 100} height="8" rx="2" fill={f === family ? "var(--accent)" : "var(--line-strong)"} />
                      </svg>
                    </td>
                    <td className="mono whitespace-nowrap py-1 pl-3 text-right text-xs tabular">{nf.format(l)}–{nf.format(h)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="card p-5 rise" style={{ ["--i" as string]: 3 }} aria-labelledby="remote-h">
          <h2 id="remote-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{m.remote}</h2>
          <p className="mt-0.5 text-xs text-muted">{m.remoteDesc}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th scope="col" className="text-left">{m.family}</th>
                  <th scope="col" className="text-right">{m.eurMonth}</th>
                  <th scope="col" className="text-right">≈ {m.perMonth}</th>
                </tr>
              </thead>
              <tbody>
                {FAMILIES.map((f) => (
                  <tr key={f} className={f === family ? "font-medium" : ""}>
                    <th scope="row" className="text-left font-[inherit]">{m.families[f]}</th>
                    <td className="mono text-right tabular">{nf.format(REMOTE_EUR[f][0])}–{nf.format(REMOTE_EUR[f][1])}</td>
                    <td className="mono text-right tabular">{nf.format(REMOTE_EUR[f][0] * fx)}–{nf.format(REMOTE_EUR[f][1] * fx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6">
        <section className="card p-5 rise" style={{ ["--i" as string]: 4 }} aria-labelledby="calc-h">
          <h2 id="calc-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{m.calc}</h2>
          <p className="mt-0.5 text-xs text-muted">{m.calcDesc}</p>

          <div role="group" aria-label={m.mode} className="mt-4 inline-flex rounded-xl border border-line bg-surface p-0.5">
            {(["g2n", "n2g"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={mode === k}
                onClick={() => setMode(k)}
                className={`min-h-8 rounded-[10px] px-3 text-sm font-medium transition-colors ${mode === k ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"}`}
              >
                {m[k]}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <label htmlFor="sal-amt" className="label">{mode === "g2n" ? m.grossMonthly : m.netMonthly}</label>
            <input id="sal-amt" inputMode="decimal" className="input tabular" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="sal-out" />
          </div>

          <dl id="sal-out" aria-live="polite" className="mt-4 divide-y divide-line text-sm">
            {mode === "n2g" && (
              <div className="flex justify-between py-2 font-medium">
                <dt>{m.neededGross}</dt>
                <dd className="mono tabular">{nf2.format(gross)} DT</dd>
              </div>
            )}
            <div className="flex justify-between py-2"><dt className="text-ink-2">{m.cnss}</dt><dd className="mono tabular">−{nf2.format(b.cnss)}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-ink-2">{m.pro}</dt><dd className="mono tabular text-muted">{nf2.format(b.proExpenses)}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-ink-2">{m.taxable}</dt><dd className="mono tabular text-muted">{nf2.format(b.taxable)}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-ink-2">{m.irpp}</dt><dd className="mono tabular">−{nf2.format(b.irpp)}</dd></div>
            <div className="flex items-baseline justify-between py-3">
              <dt className="font-semibold">{m.net} {m.month}</dt>
              <dd className="display tabular text-2xl">{nf2.format(b.netMonthly)} DT</dd>
            </div>
            <div className="flex justify-between py-2 text-muted"><dt>{m.annual}</dt><dd className="mono tabular">{nf.format(b.netMonthly * 12)} DT</dd></div>
          </dl>
        </section>

        <section className="card p-5 rise" style={{ ["--i" as string]: 5 }} aria-labelledby="fx-h">
          <h2 id="fx-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{m.fx}</h2>
          <div className="mt-3">
            <label htmlFor="fx-rate" className="label">{m.fxRate}</label>
            <input id="fx-rate" inputMode="decimal" className="input tabular" value={rate} onChange={(e) => setRate(e.target.value)} aria-describedby="fx-hint" />
            <p id="fx-hint" className="hint">{m.fxHint}</p>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <label htmlFor="fx-eur" className="label">{m.eur}</label>
              <input id="fx-eur" inputMode="decimal" className="input tabular" value={eurVal} onChange={(e) => setConv({ side: "eur", v: e.target.value })} />
            </div>
            <ArrowLeftRight size={16} aria-hidden="true" className="mb-3 text-muted" />
            <div>
              <label htmlFor="fx-tnd" className="label">{m.tnd}</label>
              <input id="fx-tnd" inputMode="decimal" className="input tabular" value={tndVal} onChange={(e) => setConv({ side: "tnd", v: e.target.value })} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
