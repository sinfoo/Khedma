import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, NotebookPen, Plus } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { listDebriefs } from "@/lib/repo/coach";
import { CompanyAvatar, EmptyState, PageHeader } from "@/components/kit";
import { CoachTabs } from "@/components/coach/parts";
import { fmtDate } from "@/components/ui";

export const metadata: Metadata = { title: "Debriefs" };

export default async function DebriefListPage() {
  const { t, locale } = await getDict();
  const d = t.coach2.debrief;
  const rows = listDebriefs();
  return (
    <>
      <PageHeader
        eyebrow={t.coach2.title}
        title={d.heading}
        lead={d.lead}
        actions={<Link href="/app/coach/debrief/new" className="btn btn-primary"><Plus size={16} aria-hidden="true" /> {d.newCta}</Link>}
      />
      <CoachTabs t={t} current="debrief" />
      {rows.length === 0 ? (
        <EmptyState icon={<NotebookPen size={22} aria-hidden="true" />} title={d.listEmpty} hint={d.listEmptyHint}>
          <Link href="/app/coach/debrief/new" className="btn btn-primary">{d.newCta}</Link>
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-line rise" style={{ ["--i" as string]: 1 }}>
          {rows.map((r) => {
            const red = r.questions.filter((q) => q.rating === "red").length;
            return (
              <li key={r.id}>
                <Link href={`/app/coach/debrief/${r.id}`} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <CompanyAvatar name={r.company || "?"} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.company ? `${r.company} — ${r.role}` : d.rounds[r.round]}</span>
                    <span className="block truncate text-xs text-muted">
                      {d.rounds[r.round]} · {fmtDate(r.created_at, locale)} · {fmt(d.stats, { q: r.questions.length, r: red })}
                    </span>
                  </span>
                  <span className={`chip ${r.outcome === "forward" ? "chip-success" : r.outcome === "rejected" ? "chip-danger" : ""}`}>{d.outcomes[r.outcome]}</span>
                  <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
