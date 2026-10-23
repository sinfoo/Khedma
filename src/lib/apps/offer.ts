// The offer actually received (not the posting): what an intern or new graduate weighs before saying yes.
// Shape after waddington/job-application-tracker's offer record (Apache-2.0), reworked for stipends. Pure.
import { TND_PER, type SalaryCurrency } from "../salaries";

export interface OfferRecord {
  /** Amount per `period`, in `currency`; null when not stated. */
  pay: number | null;
  currency: SalaryCurrency;
  period: "month" | "year";
  /** Duration in months (internships, fixed-term); null for open-ended. */
  months: number | null;
  start: string; // YYYY-MM-DD or ""
  respondBy: string; // YYYY-MM-DD or ""
  remoteDays: number | null; // per week
  perks: string; // transport, meals, housing…
  hireAfter: boolean; // a job offer is on the table after the internship / PFE
  notes: string;
}

export const EMPTY_OFFER: OfferRecord = { pay: null, currency: "TND", period: "month", months: null, start: "", respondBy: "", remoteDays: null, perks: "", hireAfter: false, notes: "" };

const CURRENCIES = Object.keys(TND_PER) as SalaryCurrency[];
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const num = (v: unknown, max: number) => {
  const n = Number(v);
  return v === null || v === "" || v === undefined || !Number.isFinite(n) || n < 0 ? null : Math.min(max, Math.round(n * 100) / 100);
};
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function normalizeOffer(raw: unknown): OfferRecord {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    pay: num(r.pay, 10_000_000),
    currency: CURRENCIES.includes(r.currency as SalaryCurrency) ? (r.currency as SalaryCurrency) : "TND",
    period: r.period === "year" ? "year" : "month",
    months: num(r.months, 120),
    start: date(r.start),
    respondBy: date(r.respondBy),
    remoteDays: num(r.remoteDays, 7),
    perks: text(r.perks, 300),
    hireAfter: r.hireAfter === true,
    notes: text(r.notes, 1000),
  };
}

/** Monthly pay in TND, for comparing offers (indicative: fixed rates). */
export function offerMonthlyTnd(o: OfferRecord): number | null {
  if (o.pay === null) return null;
  return Math.round((o.period === "year" ? o.pay / 12 : o.pay) * TND_PER[o.currency]);
}

export const hasOffer = (o: OfferRecord) => o.pay !== null || !!o.respondBy || !!o.start || o.months !== null || !!o.perks || o.hireAfter;
