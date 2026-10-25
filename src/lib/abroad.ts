// Internships abroad: legal pay floors and the check that compares an offer against them. Pure.
// Figures change every January: re-check them against the official pages below once a year.
import type { Job } from "./types";
import { countryOf } from "./geo";
import { extractSalaryMentions } from "./salaries";

/** When the figures below were last checked against their sources. */
export const ABROAD_CHECKED = "2026-10-25";

export type FloorCountry = "FR" | "DE";

/**
 * Legal minimum pay for an internship, in EUR per hour, and from which length it applies.
 * - France: the gratification is due past 2 months (or 308 hours) in one company; 15 % of the hourly social
 *   security ceiling, 4.50 €/h in 2026 (ceiling 30 €/h).
 * - Germany: the minimum wage (13.90 €/h in 2026) applies to voluntary internships longer than 3 months, from day one.
 *   Internships required by the student's curriculum are exempt.
 */
export const STIPEND_FLOORS: Record<FloorCountry, { perHour: number; afterMonths: number; hoursPerMonth: number; curriculumExempt: boolean; source: string }> = {
  FR: { perHour: 4.5, afterMonths: 2, hoursPerMonth: 151.67, curriculumExempt: false, source: "https://www.service-public.gouv.fr/particuliers/vosdroits/F32131" },
  DE: { perHour: 13.9, afterMonths: 3, hoursPerMonth: 173.33, curriculumExempt: true, source: "https://www.bmas.de/DE/Arbeit/Arbeitsrecht/Mindestlohn/mindestlohn.html" },
};

/** Internship length in months written in the posting ("stage de 6 mois", "6-month internship", "3 Monate"), or null. */
export function internshipMonths(text: string): number | null {
  const months = [...(text ?? "").matchAll(/\b(\d{1,2})\s*-?\s*(mois|months?|monate?n?)\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 24);
  return months.length ? Math.max(...months) : null;
}

export interface StipendCheck {
  country: FloorCountry;
  /** Legal floor per month, full time, rounded to the euro. */
  floorMonthly: number;
  /** Lowest monthly pay the posting names in EUR, or null when it names none. */
  offeredMonthly: number | null;
  below: boolean;
  months: number | null;
}

/** The legal floor that applies to an internship in France or Germany, and whether the posting's pay is under it. */
export function stipendCheck(job: Pick<Job, "location" | "description" | "type">): StipendCheck | null {
  if (job.type !== "stage" && job.type !== "pfe") return null;
  const country = countryOf(job.location);
  if (country !== "FR" && country !== "DE") return null;
  const rule = STIPEND_FLOORS[country];
  const months = internshipMonths(job.description);
  if (months !== null && months <= rule.afterMonths) return null; // short internships have no floor
  const floorMonthly = Math.round(rule.perHour * rule.hoursPerMonth);
  const monthly = extractSalaryMentions(job.description)
    .filter((m) => m.currency === "EUR")
    .map((m) => (m.period === "hour" ? m.min * rule.hoursPerMonth : m.period === "year" ? m.min / 12 : m.period === "month" || m.min < 5000 ? m.min : null))
    .filter((v): v is number => v !== null);
  const offeredMonthly = monthly.length ? Math.round(Math.min(...monthly)) : null;
  return { country, floorMonthly, offeredMonthly, below: offeredMonthly !== null && offeredMonthly < floorMonthly * 0.98, months };
}
