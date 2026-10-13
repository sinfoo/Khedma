import type { Metadata } from "next";
import Link from "next/link";
import { Download, Inbox, Link2, Plus } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { EmptyState, PageHeader } from "@/components/kit";
import { OffersBrowser } from "@/components/offers/offers-browser";
import { OfferSearch } from "@/components/offers/offer-search";
import { defaultKeywords, listSourceRows } from "@/lib/repo/sources";
import { loadDemoJobs } from "@/app/actions/jobs";
import { applyFilters, filtersToQuery, listOfferRows, listSources, listViews, parseFilters, unevaluated } from "@/lib/repo/offers";
import { getProfile, stats } from "@/lib/db";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { REMOTE_CODE, countryOf } from "@/lib/geo";

const countryCodesOf = (rows: { location: string; remote: boolean }[]) => {
  const set = new Set<string>();
  for (const r of rows) {
    const c = countryOf(r.location) ?? (r.remote ? REMOTE_CODE : null);
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => (a === REMOTE_CODE ? 1 : b === REMOTE_CODE ? -1 : a.localeCompare(b)));
};

export const metadata: Metadata = { title: "Offers" };

export default async function JobsPage({ searchParams }: PageProps<"/app/jobs">) {
  const { t } = await getDict();
  const o = t.offers2;
  const sp = await searchParams;
  const f = parseFilters(sp);
  const query = filtersToQuery(f);
  const all = listOfferRows(f.archived);
  const s = stats();

  const extra = getProfileExtra();
  const search = (
    <OfferSearch
      keywords={defaultKeywords(getProfile())}
      places={{ countries: extra.places.countries, remote: extra.places.remote }}
      sources={listSourceRows().filter((x) => x.enabled).map((x) => ({ id: x.id, label: x.label, kind: x.kind }))}
      autoFocus={sp.focus === "search"}
    />
  );

  if (!f.archived && all.length === 0) {
    return (
      <>
        <PageHeader title={o.title} />
        {search}
        <EmptyState icon={<Inbox size={22} aria-hidden="true" />} title={o.emptyTitle} hint={o.emptyHint}>
          <Link href="/app/jobs/new" className="btn btn-secondary">
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
            <Link href="/app/jobs/new" className="btn btn-secondary">
              <Plus size={16} aria-hidden="true" /> {o.add}
            </Link>
          </>
        }
      />
      {search}
      <OffersBrowser
        rows={applyFilters(all, f)}
        total={all.length}
        filters={f}
        query={query}
        views={listViews()}
        sources={listSources()}
        countryCodes={countryCodesOf(all)}
        myCountries={getProfileExtra().places.countries}
        pending={unevaluated()}
        autoEvaluate={sp.evaluate === "1"}
      />
    </>
  );
}
