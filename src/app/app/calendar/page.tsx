import { pageTitle } from "@/lib/i18n/title";
import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { dayKey, getCalendar, parseMonth, reminderTargets, shiftMonth } from "@/lib/repo/insights";
import { CalendarView } from "@/components/insights/calendar-view";

export const generateMetadata = pageTitle("calendar");

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { t, locale } = await getDict();
  const m = t.insights2.cal;
  const now = new Date();
  const month = parseMonth(typeof sp.month === "string" ? sp.month : null, now);
  const today = dayKey(now);
  const { grid, items } = getCalendar(month);
  const [y, mo] = month.split("-").map(Number);
  const monthLabel = new Date(y, mo - 1, 1).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { month: "long", year: "numeric" });
  const prev = `/app/calendar?month=${shiftMonth(month, -1)}`;
  const next = `/app/calendar?month=${shiftMonth(month, 1)}`;
  const isThisMonth = today.startsWith(month);

  const inMonth = items.filter((i) => i.day.startsWith(month));
  const n = (k: string) => inMonth.filter((i) => i.kind === k).length;
  const lead = fmt(m.monthLead, { i: n("interview"), r: n("reminder"), d: n("deadline") });
  const iconBtn = "grid size-9 place-items-center rounded-[10px] border border-line bg-surface text-ink hover:bg-surface-2";

  return (
    <>
      <header className="mb-[18px] flex flex-wrap items-end justify-between gap-4 rise">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] capitalize leading-[1.1] tracking-[-0.025em] sm:text-[2rem]">{monthLabel}</h1>
          <p className="mt-1.5 text-muted">{lead}</p>
        </div>
        <nav aria-label={m.title} className="flex flex-wrap items-center gap-1.5">
          <Link href={prev} className={iconBtn} aria-label={m.prev}><ChevronLeft size={16} aria-hidden="true" /></Link>
          <Link href="/app/calendar" className="btn btn-outline !h-9" aria-current={isThisMonth ? "date" : undefined}>{m.today}</Link>
          <Link href={next} className={iconBtn} aria-label={m.next}><ChevronRight size={16} aria-hidden="true" /></Link>
          <a href="/api/ics/all" className="btn btn-outline !h-9 sm:ml-2" download><CalendarPlus size={14} aria-hidden="true" /> {m.export}</a>
        </nav>
      </header>
      <CalendarView
        key={month}
        month={month}
        monthLabel={monthLabel}
        grid={grid}
        items={items}
        today={today}
        prevHref={prev}
        nextHref={next}
        targets={reminderTargets()}
      />
    </>
  );
}
