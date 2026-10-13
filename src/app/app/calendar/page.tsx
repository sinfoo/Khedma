import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { dayKey, getCalendar, parseMonth, reminderTargets, shiftMonth } from "@/lib/repo/insights";
import { PageHeader } from "@/components/kit";
import { CalendarView } from "@/components/insights/calendar-view";

export const metadata: Metadata = { title: "Calendar" };

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

  return (
    <>
      <PageHeader
        eyebrow={m.title}
        title={<span className="capitalize">{monthLabel}</span>}
        lead={m.lead}
        actions={
          <>
            <nav aria-label={m.title} className="flex items-center gap-1">
              <Link href={prev} className="btn btn-secondary btn-icon" aria-label={m.prev}><ChevronLeft size={18} aria-hidden="true" /></Link>
              <Link href="/app/calendar" className="btn btn-secondary" aria-current={isThisMonth ? "date" : undefined}>{m.today}</Link>
              <Link href={next} className="btn btn-secondary btn-icon" aria-label={m.next}><ChevronRight size={18} aria-hidden="true" /></Link>
            </nav>
            <a href="/api/ics/all" className="btn btn-ghost" download><Download size={16} aria-hidden="true" /> {m.export}</a>
          </>
        }
      />
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
