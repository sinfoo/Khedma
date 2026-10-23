import { TIER_FACTOR, TUNIS_BANDS, type Family, type Level, type Tier } from "./data";

export * from "./data";

const round50 = (n: number) => Math.round(n / 50) * 50;

export function band(family: Family, level: Level, tier: Tier): [number, number] {
  const [lo, hi] = TUNIS_BANDS[family][level];
  return [round50(lo * TIER_FACTOR[tier]), round50(hi * TIER_FACTOR[tier])];
}

// ---------- gross <-> net (Tunisia) ----------
// ponytail: simplified model — employee CNSS 9.18%, 10% professional-expenses allowance (capped 2,000 DT/yr),
// 2025 IRPP schedule. Ignores the 0.5% CSS, family deductions, 13th-month pay and sector conventions;
// replace with a full payroll engine if exact payslips are ever needed.
export const CNSS_RATE = 0.0918;
export const PRO_EXPENSES = { rate: 0.1, cap: 2000 };
/** Annual IRPP brackets (Loi de finances 2025): [upper bound in DT, marginal rate]. */
export const IRPP_BRACKETS: [number, number][] = [
  [5000, 0],
  [10000, 0.15],
  [20000, 0.25],
  [30000, 0.3],
  [40000, 0.33],
  [50000, 0.36],
  [70000, 0.38],
  [Infinity, 0.4],
];

export function irpp(taxableAnnual: number): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of IRPP_BRACKETS) {
    if (taxableAnnual <= lower) break;
    tax += (Math.min(taxableAnnual, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

export interface NetBreakdown {
  grossMonthly: number;
  cnss: number;
  proExpenses: number;
  taxable: number;
  irpp: number;
  netMonthly: number;
}

/** Monthly gross DT → approximate monthly net DT (amounts per month, tax computed on the annualised salary). */
export function netFromGross(grossMonthly: number): NetBreakdown {
  const g = Math.max(0, grossMonthly);
  const annual = g * 12;
  const cnss = annual * CNSS_RATE;
  const pro = Math.min((annual - cnss) * PRO_EXPENSES.rate, PRO_EXPENSES.cap);
  const taxable = Math.max(0, annual - cnss - pro);
  const tax = irpp(taxable);
  const r = (n: number) => Math.round((n / 12) * 100) / 100;
  return { grossMonthly: g, cnss: r(cnss), proExpenses: r(pro), taxable: r(taxable), irpp: r(tax), netMonthly: r(annual - cnss - tax) };
}

/** Inverse of netFromGross by bisection (net is monotonic in gross). */
export function grossFromNet(netMonthly: number): number {
  let lo = 0;
  let hi = Math.max(1, netMonthly) * 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (netFromGross(mid).netMonthly < netMonthly) lo = mid;
    else hi = mid;
  }
  return Math.round(hi * 100) / 100;
}

// ---------- salary mentions in offers ----------
export type SalaryCurrency = "TND" | "EUR" | "USD" | "GBP" | "CHF" | "CAD" | "AED" | "SAR" | "QAR" | "MAD";
export interface SalaryMention {
  raw: string;
  min: number;
  max: number;
  currency: SalaryCurrency;
  period: "month" | "year" | "hour" | null;
}

// Currencies and the "100'000" separator after elliottdehn/open-jobs tools/salary.py (CC0).
const NUM = String.raw`\d{1,3}(?:[  .,'’]\d{3})+|\d+(?:[.,]\d+)?`;
const PRE = String.raw`(?:us|ca|c)?\$|€|£|\b(?:usd|eur|gbp|chf|cad|aed|sar|qar)\b`;
const CUR = String.raw`dt|tnd|dinars?|€|eur(?:os?)?|(?:us|ca|c)?\$|usd|£|gbp|chf|cad|aed|sar|qar|mad\b`;
// "1 200 DT", "800-1200 TND", "1,5k DT", "€2000", "2.5k€", "30k EUR / an", "$120,000 - $150,000", "CHF 100'000", "25 €/h"
const MENTION_RE = new RegExp(
  String.raw`(?:(${PRE})\s?)?(${NUM})\s*(k)?(?:\s*(?:-|–|à|to)\s*(?:${PRE})?\s*(${NUM})\s*(k)?)?\s*(${CUR})?(?:(?:[\s/]*(?:par|per|bruts?|nets?|de l'|a|an))*[\s/]*(mois|monthly|month|mensuel|année|an|yearly|year|annuel|heure|hourly|hour|hr|h(?![\w/]))\b)?`,
  "gi",
);

const CODES: [RegExp, SalaryCurrency][] = [[/€|eur/i, "EUR"], [/£|gbp/i, "GBP"], [/chf/i, "CHF"], [/ca\$|c\$|cad/i, "CAD"], [/aed/i, "AED"], [/sar/i, "SAR"], [/qar/i, "QAR"], [/mad/i, "MAD"], [/\$|usd/i, "USD"]];
const currencyOf = (token: string): SalaryCurrency => CODES.find(([re]) => re.test(token))?.[1] ?? "TND";

/** Rough TND per unit, for comparing offers only (not a quote). ponytail: fixed rates; refresh yearly or fetch if precision matters. */
export const TND_PER: Record<SalaryCurrency, number> = { TND: 1, EUR: 3.4, USD: 3.1, GBP: 4, CHF: 3.6, CAD: 2.3, AED: 0.85, SAR: 0.83, QAR: 0.85, MAD: 0.31 };
export const CURRENCY_SIGN: Partial<Record<SalaryCurrency, string>> = { TND: "DT", EUR: "€", USD: "$", GBP: "£" };

function num(s: string, k: boolean): number {
  const t = s.replace(/[\s  '’]/g, "");
  // "1.200" / "1,200" thousands separators vs "1,5" decimals
  const v = /^\d{1,3}([.,]\d{3})+$/.test(t) ? Number(t.replace(/[.,]/g, "")) : Number(t.replace(",", "."));
  return k ? v * 1000 : v;
}

export function extractSalaryMentions(text: string): SalaryMention[] {
  const out: SalaryMention[] = [];
  for (const m of (text ?? "").matchAll(MENTION_RE)) {
    const [raw, prefix, a, ka, b, kb, cur, per] = m;
    if (!prefix && !cur) continue;
    const currency = currencyOf(`${prefix ?? ""} ${cur ?? ""}`);
    // "30-40k" means 30k-40k; "800-1.2k" keeps 800 as is.
    let min = num(a, !!ka || (!!kb && Number(a.replace(",", ".")) < 100));
    let max = b ? num(b, !!kb || !!ka) : min;
    if (min > max) [min, max] = [max, min];
    const hourly = !!per && /^(heure|hourly|hour|hr|h)$/i.test(per);
    // Sanity bounds: ignore years, phone numbers, tiny numbers (an hourly rate is small by nature).
    if (hourly ? min < 5 || max > 500 : min < 100 || max > 500_000) continue;
    const period = hourly ? "hour" : per ? (/mois|month|mensuel/i.test(per) ? "month" : "year") : max >= 15_000 ? "year" : null;
    out.push({ raw: raw.trim(), min, max, currency, period });
  }
  return out;
}
