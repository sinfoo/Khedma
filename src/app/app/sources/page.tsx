import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, SlidersHorizontal } from "lucide-react";
import { ScanPanel } from "@/components/sources/scan-panel";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getProfile } from "@/lib/db";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { defaultKeywords, searchCountries, listSourceRows } from "@/lib/repo/sources";
import { cvForMatching } from "@/lib/repo/offers";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesPage({ searchParams }: PageProps<"/app/sources">) {
  const [{ t }, sp] = await Promise.all([getDict(), searchParams]);
  const m = t.sources2.scan2.manage;
  const rows = listSourceRows();
  const profile = getProfile();
  const extra = getProfileExtra();
  // A native form submit before hydration lands here with ?q=; run it as the typed search.
  const typed = typeof sp.q === "string" ? sp.q.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean) : [];
  return (
    <>
      <ScanPanel
        keywords={typed.length ? typed : defaultKeywords(profile, cvForMatching().text)}
        places={{ countries: searchCountries(extra.places.countries, rows), remote: extra.places.remote }}
        sources={rows.filter((x) => x.enabled).map((x) => ({ id: x.id, label: x.label, kind: x.kind }))}
        autoStart={sp.scan === "1" || typed.length > 0}
        typed={typed.length > 0}
      />
      <Link href="/app/sources/manage" className="card card-hover mt-5 flex items-center gap-3 px-[18px] py-3.5">
        <span className="tile tile-sm tone-accent"><SlidersHorizontal size={16} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{m.link}</span>
          <span className="block truncate text-[0.8rem] text-muted">{fmt(m.linkSub, { n: rows.filter((s) => s.enabled && !s.company).length, c: rows.filter((s) => s.company).length })}</span>
        </span>
        <ChevronRight size={16} className="text-muted" aria-hidden="true" />
      </Link>
    </>
  );
}
