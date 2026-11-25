// Engine output (codes, dates, keys) as words in the interface language. Server side: client components get the
// finished labels as props, so the browser never formats a name differently from the server.
import { fmt, type Dict } from "@/lib/i18n/dict";
import { countryByCode } from "@/lib/geo";
import type { Locale } from "@/lib/types";
import type { Criteria } from "@/lib/bourses/criteria";
import type { DeadlineInfo } from "@/lib/bourses/deadline";
import type { Eligibility } from "@/lib/bourses/eligibility";
import type { Bourse } from "@/lib/bourses/model";
import type { Reason } from "@/lib/bourses/rank";
import type { Funding, StudyField, StudyLevel } from "@/lib/bourses/types";

const tag = (locale: Locale) => (locale === "fr" ? "fr-FR" : "en-GB");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const intlName = (type: "region" | "language", code: string, locale: Locale): string | undefined => {
  try {
    return new Intl.DisplayNames([tag(locale)], { type }).of(code);
  } catch {
    return undefined; // not a valid code
  }
};

/** Khedma's own country names first, the platform's for every other ISO code. */
export const countryLabel = (code: string, locale: Locale) => countryByCode(code)?.[locale] ?? intlName("region", code, locale) ?? code;
export const languageLabel = (code: string, locale: Locale) => cap(intlName("language", code, locale) ?? code);
export const regionLabel = (t: Dict, key: string) => (t.sources2.scan2.regions as Record<string, string>)[key] ?? key;
export const destinationLabel = (t: Dict, d: string, locale: Locale) => (/^[A-Z]{2}$/.test(d) ? countryLabel(d, locale) : regionLabel(t, d));

/** "2026-12-15" -> "15 Dec 2026". Noon keeps the calendar day in every time zone. */
export const dateLabel = (ymd: string, locale: Locale, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString(tag(locale), opts);
export const dateTimeLabel = (iso: string, locale: Locale) => new Date(iso).toLocaleString(tag(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export type Tone = "success" | "saffron" | "accent" | "danger" | "";
export const chipTone = (tone: Tone) => (tone ? `chip chip-${tone}` : "chip");

/** The deadline chip: status in words, and the date behind it. */
export function deadlineText(t: Dict, d: DeadlineInfo, locale: Locale, kind: Bourse["kind"]): { label: string; detail: string | null; tone: Tone } {
  const m = t.bourses2.deadline;
  // A programme's date is the usual one of its yearly cycle; a live call states this year's date.
  const date = d.date ? fmt(kind === "call" ? m.on : d.approximate ? m.around : m.usual, { date: dateLabel(d.date, locale) }) : null;
  switch (d.status) {
    case "closing":
      return { label: d.daysLeft === 0 ? m.today : fmt(m.closing, { n: d.daysLeft ?? 0 }), detail: date, tone: "saffron" };
    case "open":
      return { label: fmt(m.open, { n: d.daysLeft ?? 0 }), detail: date, tone: "success" };
    case "rolling":
      return { label: m.rolling, detail: null, tone: "success" };
    case "soon":
      return { label: fmt(m.soon, { n: Math.max(1, Math.ceil((d.opensInDays ?? 0) / 7)) }), detail: date, tone: "accent" };
    case "closed":
      if (kind === "call") return { label: m.passed, detail: date, tone: "" };
      return { label: m.closed, detail: [d.opensOn && fmt(m.opensOn, { date: dateLabel(d.opensOn, locale) }), date].filter(Boolean).join(", ") || null, tone: "" };
    default:
      return { label: m.unknown, detail: null, tone: "" };
  }
}

export function reasonText(t: Dict, r: Reason, locale: Locale): string {
  const m = t.bourses2;
  const v = { ...r.vars } as Record<string, string | number>;
  if (typeof v.field === "string") v.field = m.fields[v.field as StudyField] ?? v.field;
  if (typeof v.level === "string") v.level = m.levels[v.level as StudyLevel] ?? v.level;
  if (typeof v.funding === "string") v.funding = m.funding[v.funding as Funding] ?? v.funding;
  if (typeof v.lang === "string") v.lang = languageLabel(v.lang, locale).toLowerCase();
  if (typeof v.country === "string") v.country = countryLabel(v.country, locale);
  return fmt(m.reasons[r.key], v);
}

/** One line on who may apply, for the card. */
export function eligibilityText(t: Dict, e: Eligibility, nationality: string, locale: Locale): { label: string; tone: Tone } {
  const m = t.bourses2.eligibility;
  const country = countryLabel(nationality, locale);
  if (e.eligible === null) return { label: m.unknown, tone: "" };
  if (!e.eligible) return { label: fmt(m.no, { country }), tone: "danger" };
  if (e.via === "*") return { label: m.any, tone: "success" };
  if (e.via && e.via in m.groups) return { label: fmt(m.group, { group: m.groups[e.via as keyof typeof m.groups] }), tone: "success" };
  return { label: fmt(e.via === "verified" ? m.verified : m.country, { country }), tone: "success" };
}

export const moneyLabel = (t: Dict, b: Bourse, locale: Locale) =>
  b.monthlyStipend ? fmt(t.bourses2.card.perMonth, { amount: b.monthlyStipend.amount.toLocaleString(tag(locale)), currency: b.monthlyStipend.currency }) : null;
export const feeLabel = (t: Dict, b: Bourse) => (b.applicationFee === null ? null : b.applicationFee === 0 ? t.bourses2.card.free : fmt(t.bourses2.card.fee, { n: b.applicationFee }));

/** What the defaults were guessed from: "final-year student, Master and PhD, Computer science". */
export function basisText(t: Dict, stage: string | null, c: Criteria): string {
  const m = t.bourses2;
  return [stage && (m.criteria.stages as Record<string, string>)[stage], c.levels.map((l) => m.levels[l]).join(", "), c.fields.map((f) => m.fields[f]).join(", ")].filter(Boolean).join(" · ");
}
