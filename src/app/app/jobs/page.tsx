import type { Metadata } from "next";
import Link from "next/link";
import { Link2, Plus, Radar } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { EmptyState, PageHeader } from "@/components/kit";
import { OffersBrowser } from "@/components/offers/offers-browser";
import { ScoreNewButton } from "@/components/offers/score-new-button";
import { defaultKeywords, listSourceRows } from "@/lib/repo/sources";
import { cvForMatching } from "@/lib/repo/offers";
import { loadDemoJobs } from "@/app/actions/jobs";
import { listOfferRows, listSources, listViews, parseFilters, unevaluated } from "@/lib/repo/offers";
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
  const L = o.list2;
  const sp = await searchParams;
  const f = parseFilters(sp);
  const all = listOfferRows(f.archived);
  const s = stats();
  const pending = unevaluated();

  if (!f.archived && all.length === 0) {
    const kw = defaultKeywords(getProfile(), cvForMatching().text).slice(0, 4).join(" · ");
    const enabled = listSourceRows().filter((x) => x.enabled);
    const names = enabled.slice(0, 5).map((x) => x.label).join(", ");
    const sources = enabled.length > 5 ? `${names}… (${fmt(L.sourcesN, { n: enabled.length })})` : names || fmt(L.sourcesN, { n: 0 });
    return (
      <>
        <PageHeader title={o.title} />
        <EmptyState
          icon={<Radar aria-hidden="true" />}
          title={L.emptyTitle}
          hint={
            kw ? (
              <>
                {L.emptyHint.split("{kw}")[0]}
                <strong className="text-ink">{kw}</strong>
                {fmt(L.emptyHint.split("{kw}")[1] ?? "", { sources })}
              </>
            ) : (
              fmt(L.emptyHintNoKw, { sources })
            )
          }
        >
          <Link href="/app/sources?scan=1" className="btn btn-saffron btn-lg">
            <Radar size={16} aria-hidden="true" /> {L.scanBoards}
          </Link>
          <Link href="/app/jobs/new" className="btn btn-outline btn-lg">
            <Link2 size={16} aria-hidden="true" /> {L.pastePosting}
          </Link>
          <form action={async () => { "use server"; await loadDemoJobs(); }} className="basis-full text-center">
            <p className="text-[0.78rem] text-muted">
              {L.orDemo} <button className="font-semibold text-accent-text hover:underline">{L.loadDemo}</button>
            </p>
          </form>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={o.title}
        lead={pending.length ? fmt(o.lead2, { n: s.jobs, e: s.evaluated, u: pending.length }) : fmt(o.lead2None, { n: s.jobs, e: s.evaluated })}
        actions={
          <>
            <ScoreNewButton n={pending.length} />
            <Link href="/app/jobs/new" className="btn btn-outline">
              <Plus size={15} aria-hidden="true" /> {o.add}
            </Link>
          </>
        }
      />
      <OffersBrowser
        key={JSON.stringify(f)}
        all={all}
        total={all.length}
        filters={f}
        views={listViews()}
        sources={listSources()}
        countryCodes={countryCodesOf(all)}
        myCountries={getProfileExtra().places.countries}
        pending={pending}
        autoEvaluate={sp.evaluate === "1"}
      />
    </>
  );
}
