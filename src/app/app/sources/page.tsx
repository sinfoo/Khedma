import type { Metadata } from "next";
import { PageHeader } from "@/components/kit";
import { SourcesBoard } from "@/components/sources/sources-board";
import { getDict } from "@/lib/i18n/server";
import { getProfile } from "@/lib/db";
import { clipToken } from "@/lib/clip";
import { CATALOG } from "@/lib/sources/catalog";
import { defaultKeywords, getAutoScan, listDiscovered, listRuns, listSourceRows } from "@/lib/repo/sources";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesPage({ searchParams }: PageProps<"/app/sources">) {
  const [{ t }, sp] = await Promise.all([getDict(), searchParams]);
  return (
    <>
      <PageHeader eyebrow={t.sources2.eyebrow} title={t.sources2.title} lead={t.sources2.lead} />
      <SourcesBoard
        sources={listSourceRows()}
        discovered={listDiscovered(8)}
        runs={listRuns(8)}
        auto={getAutoScan()}
        profileKeywords={defaultKeywords(getProfile())}
        profileLocation={getProfile().target_locations[0] ?? ""}
        clipToken={clipToken()}
        autoStart={sp.scan === "1"}
        missingEnv={CATALOG.filter((c) => c.needsEnv?.some((n) => !process.env[n]?.trim())).map((c) => c.kind)}
      />
    </>
  );
}
