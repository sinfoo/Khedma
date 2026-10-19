import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CatalogClient } from "@/components/sources/catalog-client";
import { History, SourcesList } from "@/components/sources/sources-board";
import { Clipper } from "@/components/sources/clipper";
import { TrackedCompanies } from "@/components/sources/tracked-companies";
import { getDict } from "@/lib/i18n/server";
import { getProfile } from "@/lib/db";
import { clipToken } from "@/lib/clip";
import { CATALOG } from "@/lib/sources/catalog";
import { TN_COMPANIES } from "@/lib/recommend/companies";
import { defaultKeywords, getAutoScan, getSearchPrefs, listRuns, listSourceRows, searchCountries } from "@/lib/repo/sources";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { cvForMatching } from "@/lib/repo/offers";

export const metadata: Metadata = { title: "Manage sources" };

/** Everything that sets up the scan, kept off the scan page so the radar and its results stay the focus. */
export default async function ManageSourcesPage() {
  const { t } = await getDict();
  const m = t.sources2.scan2.manage;
  const rows = listSourceRows();
  // Employers whose link is a careers page (not a bare homepage) can be tracked in one click.
  const suggestions = TN_COMPANIES.filter((c) => /career|carri|job|emploi|recrut/i.test(c.url)).map((c) => ({ name: c.name, url: c.url }));
  return (
    <>
      <Link href="/app/sources" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden="true" /> {m.back}
      </Link>
      <header className="mb-[18px]">
        <h1 className="text-[1.75rem] leading-[1.1] tracking-[-0.025em] sm:text-[2rem]">{m.title}</h1>
        <p className="mt-1.5 text-muted">{m.lead}</p>
      </header>
      <SourcesList sources={rows.filter((s) => !s.company)} auto={getAutoScan()} />
      <div className="mt-8 space-y-8">
        <TrackedCompanies tracked={rows.filter((s) => s.company)} suggestions={suggestions} prefs={getSearchPrefs()} />
        <div id="catalog" className="scroll-mt-20">
          <CatalogClient
            existing={rows.map((s) => `${s.kind}:${s.handle}`)}
            keywords={defaultKeywords(getProfile(), cvForMatching().text)}
            missingEnv={CATALOG.filter((c) => c.needsEnv?.some((n) => !process.env[n]?.trim())).map((c) => c.kind)}
            countries={searchCountries(getProfileExtra().places.countries, rows)}
          />
        </div>
        <Clipper token={clipToken()} />
        <History runs={listRuns(8)} />
      </div>
      <p className="mt-6 px-1 text-xs leading-relaxed text-muted">{t.sources2.respect}</p>
    </>
  );
}
