import type { Metadata } from "next";
import Link from "next/link";
import { Download, Inbox, Link2, Plus } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { EmptyState, PageHeader } from "@/components/kit";
import { OffersBrowser } from "@/components/offers/offers-browser";
import { loadDemoJobs } from "@/app/actions/jobs";
import { applyFilters, filtersToQuery, listOfferRows, listSources, listViews, parseFilters, unevaluated } from "@/lib/repo/offers";
import { stats } from "@/lib/db";

export const metadata: Metadata = { title: "Offers" };

export default async function JobsPage({ searchParams }: PageProps<"/app/jobs">) {
  const { t } = await getDict();
  const o = t.offers2;
  const sp = await searchParams;
  const f = parseFilters(sp);
  const query = filtersToQuery(f);
  const all = listOfferRows(f.archived);
  const s = stats();

  if (!f.archived && all.length === 0) {
    return (
      <>
        <PageHeader title={o.title} />
        <EmptyState icon={<Inbox size={22} aria-hidden="true" />} title={o.emptyTitle} hint={o.emptyHint}>
          <Link href="/app/jobs/new" className="btn btn-primary">
            <Link2 size={16} aria-hidden="true" /> {o.add}
          </Link>
          <form action={async () => { "use server"; await loadDemoJobs(); }}>
            <button className="btn btn-secondary">{o.loadDemo}</button>
          </form>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={o.title}
        lead={fmt(o.lead, { n: s.jobs, e: s.evaluated })}
        actions={
          <>
            <a href={`/api/offers/export${query ? `?${query}` : ""}`} className="btn btn-secondary" download>
              <Download size={16} aria-hidden="true" /> {o.export}
            </a>
            <Link href="/app/jobs/new" className="btn btn-primary">
              <Plus size={16} aria-hidden="true" /> {o.add}
            </Link>
          </>
        }
      />
      <OffersBrowser
        rows={applyFilters(all, f)}
        total={all.length}
        filters={f}
        query={query}
        views={listViews()}
        sources={listSources()}
        pending={unevaluated()}
        autoEvaluate={sp.evaluate === "1"}
      />
    </>
  );
}
