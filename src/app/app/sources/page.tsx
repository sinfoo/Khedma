import type { Metadata } from "next";
import { PageHeader } from "@/components/kit";
import { SourcesBoard } from "@/components/sources/sources-board";
import { TrackedCompanies } from "@/components/sources/tracked-companies";
import { getDict } from "@/lib/i18n/server";
import { getProfile } from "@/lib/db";
import { clipToken } from "@/lib/clip";
import { CATALOG } from "@/lib/sources/catalog";
import { TN_COMPANIES } from "@/lib/recommend/companies";
import { defaultKeywords, getAutoScan, getSearchPrefs, listDiscovered, listRuns, listSourceRows } from "@/lib/repo/sources";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesPage({ searchParams }: PageProps<"/app/sources">) {
  const [{ t }, sp] = await Promise.all([getDict(), searchParams]);
  const rows = listSourceRows();
  // Employers whose link is a careers page (not a bare homepage) can be tracked in one click.
  const suggestions = TN_COMPANIES.filter((c) => /career|carri|job|emploi|recrut/i.test(c.url)).map((c) => ({ name: c.name, url: c.url }));
  return (
    <>
      <PageHeader eyebrow={t.sources2.eyebrow} title={t.sources2.title} lead={t.sources2.lead} />
      <SourcesBoard
        sources={rows.filter((s) => !s.company)}
        discovered={listDiscovered(8)}
        runs={listRuns(8)}
        auto={getAutoScan()}
        profileKeywords={defaultKeywords(getProfile())}
        profileLocation={getProfile().target_locations[0] ?? ""}
        clipToken={clipToken()}
        autoStart={sp.scan === "1"}
        missingEnv={CATALOG.filter((c) => c.needsEnv?.some((n) => !process.env[n]?.trim())).map((c) => c.kind)}
      />
      <div className="mt-8">
        <TrackedCompanies tracked={rows.filter((s) => s.company)} suggestions={suggestions} prefs={getSearchPrefs()} />
      </div>
    </>
  );
}
