import type { Metadata } from "next";
import { ScanPanel } from "@/components/sources/scan-panel";
import { SourcesTabs } from "@/components/sources/tabs";
import { getProfile } from "@/lib/db";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { defaultKeywords, getScanOptions, searchCountries, listSourceRows } from "@/lib/repo/sources";
import { cvForMatching } from "@/lib/repo/offers";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesPage({ searchParams }: PageProps<"/app/sources">) {
  const sp = await searchParams;
  const rows = listSourceRows();
  const profile = getProfile();
  const extra = getProfileExtra();
  // A native form submit before hydration lands here with ?q=; run it as the typed search.
  const typed = typeof sp.q === "string" ? sp.q.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean) : [];
  const fromCv = defaultKeywords(profile, cvForMatching().text);
  return (
    <>
      <SourcesTabs current="scan" />
      <ScanPanel
        keywords={typed.length ? typed : fromCv}
        cvKeywords={profile.cv_md.trim() || cvForMatching().text.trim() ? fromCv : []}
        places={{ countries: searchCountries(extra.places.countries, rows), remote: extra.places.remote }}
        sources={rows.filter((x) => x.enabled).map((x) => ({ id: x.id, label: x.label, kind: x.kind }))}
        // ?scan=1 (topbar, palette, Offers, Discover) only focuses the form: the scan starts from it.
        autoStart={typed.length > 0}
        typed={typed.length > 0}
        saved={getScanOptions()}
      />
    </>
  );
}
