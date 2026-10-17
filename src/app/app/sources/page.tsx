import type { Metadata } from "next";
import { ScanPanel } from "@/components/sources/scan-panel";
import { CatalogClient } from "@/components/sources/catalog-client";
import { History, SourcesList } from "@/components/sources/sources-board";
import { Clipper } from "@/components/sources/clipper";
import { TrackedCompanies } from "@/components/sources/tracked-companies";
import { getDict } from "@/lib/i18n/server";
import { getProfile } from "@/lib/db";
import { clipToken } from "@/lib/clip";
import { CATALOG } from "@/lib/sources/catalog";
import { TN_COMPANIES } from "@/lib/recommend/companies";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { defaultKeywords, getAutoScan, getSearchPrefs, listRuns, listSourceRows } from "@/lib/repo/sources";
import { cvForMatching } from "@/lib/repo/offers";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesPage({ searchParams }: PageProps<"/app/sources">) {
  const [{ t }, sp] = await Promise.all([getDict(), searchParams]);
  const rows = listSourceRows();
  const profile = getProfile();
  const extra = getProfileExtra();
  // Employers whose link is a careers page (not a bare homepage) can be tracked in one click.
  // A native form submit before hydration lands here with ?q=; run it as the typed search.
  const typed = typeof sp.q === "string" ? sp.q.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean) : [];
  const suggestions = TN_COMPANIES.filter((c) => /career|carri|job|emploi|recrut/i.test(c.url)).map((c) => ({ name: c.name, url: c.url }));
  return (
    <>
      <ScanPanel
        keywords={typed.length ? typed : defaultKeywords(profile, cvForMatching().text)}
        places={{ countries: extra.places.countries, remote: extra.places.remote }}
        sources={rows.filter((x) => x.enabled).map((x) => ({ id: x.id, label: x.label, kind: x.kind }))}
        autoStart={sp.scan === "1" || typed.length > 0}
      />
      <SourcesList sources={rows.filter((s) => !s.company)} auto={getAutoScan()} />
      <div className="mt-8 space-y-8">
        <TrackedCompanies tracked={rows.filter((s) => s.company)} suggestions={suggestions} prefs={getSearchPrefs()} />
        <History runs={listRuns(8)} />
        <CatalogAnchor existing={rows.map((s) => `${s.kind}:${s.handle}`)} keywords={defaultKeywords(profile, cvForMatching().text)} missingEnv={CATALOG.filter((c) => c.needsEnv?.some((n) => !process.env[n]?.trim())).map((c) => c.kind)} />
        <Clipper token={clipToken()} />
      </div>
      <p className="mt-6 px-1 text-xs leading-relaxed text-muted">{t.sources2.respect}</p>
    </>
  );
}

function CatalogAnchor(props: { existing: string[]; keywords: string[]; missingEnv: string[] }) {
  return (
    <div id="catalog" className="scroll-mt-20">
      <CatalogClient {...props} />
    </div>
  );
}

