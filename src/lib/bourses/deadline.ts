// Deadlines of yearly programmes ("MM-DD", "MM", "rolling") and of live calls ("YYYY-MM-DD").
// Dates are compared as local YYYY-MM-DD strings, so a time zone never moves a deadline by a day.

export type DeadlineStatus = "open" | "closing" | "soon" | "closed" | "rolling" | "unknown";

export interface DeadlineInfo {
  /** open: apply now. closing: open and the deadline is near. soon: opens within 8 weeks. closed: wait for the next cycle. */
  status: DeadlineStatus;
  /** Next deadline, or the passed one for a closed live call. */
  date: string | null;
  daysLeft: number | null;
  /** Day applications open for the cycle that ends on `date`. */
  opensOn: string | null;
  /** Set while applications are not open yet. */
  opensInDays: number | null;
  /** Only the month is known: `date` is the last day of that month. */
  approximate: boolean;
  /** The programme publishes no opening month: "open" then means the deadline is within four months. */
  assumed: boolean;
}

/** "Opens soon" means within this many days. */
export const SOON_DAYS = 56;
/** ponytail: without an opening month we call a programme open in the four months before its deadline. */
export const ASSUMED_WINDOW_DAYS = 120;

const pad = (n: number) => String(n).padStart(2, "0");
const utc = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** A real date in month `m`: the day is clamped, so "02-29" is the 28th outside leap years. */
const dateIn = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(Math.min(d, lastDay(y, m)))}`;

/** The calendar day where the app runs. */
export const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayYmd = () => ymdOf(new Date());
/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 86_400_000);

const monthDay = (s: string | undefined | null): { m: number; d: number | null } | null => {
  const x = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec((s ?? "").trim());
  const m = x ? Number(x[1]) : 0;
  return m >= 1 && m <= 12 ? { m, d: x![2] ? Number(x![2]) : null } : null;
};

const NONE: DeadlineInfo = { status: "unknown", date: null, daysLeft: null, opensOn: null, opensInDays: null, approximate: false, assumed: false };

export function deadlineInfo(src: { opens?: string | null; deadline?: string | null }, today: string, closingDays = 30): DeadlineInfo {
  const raw = (src.deadline ?? "").trim().toLowerCase();
  if (raw === "rolling") return { ...NONE, status: "rolling" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // A live call: one date, no next cycle.
    const left = daysBetween(today, raw);
    if (left < 0) return { ...NONE, status: "closed", date: raw };
    return { ...NONE, status: left <= closingDays ? "closing" : "open", date: raw, daysLeft: left };
  }
  const end = monthDay(raw);
  if (!end) return NONE;
  const year = Number(today.slice(0, 4));
  const at = (y: number) => dateIn(y, end.m, end.d ?? 31);
  const date = at(year) >= today ? at(year) : at(year + 1);
  const daysLeft = daysBetween(today, date);
  const base = { ...NONE, date, daysLeft, approximate: end.d === null };
  const start = monthDay(src.opens);
  if (!start) {
    const status = daysLeft <= closingDays ? "closing" : daysLeft <= ASSUMED_WINDOW_DAYS ? "open" : "closed";
    return { ...base, status, assumed: true };
  }
  // The opening that belongs to this deadline is the last one on or before it (it may fall in the year before).
  const y = Number(date.slice(0, 4));
  const opening = (yy: number) => dateIn(yy, start.m, start.d ?? 1);
  const opensOn = opening(y) <= date ? opening(y) : opening(y - 1);
  if (today < opensOn) {
    const opensInDays = daysBetween(today, opensOn);
    return { ...base, status: opensInDays <= SOON_DAYS ? "soon" : "closed", opensOn, opensInDays };
  }
  return { ...base, status: daysLeft <= closingDays ? "closing" : "open", opensOn };
}
