import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { getJob, getProfile } from "@/lib/db";
import { getCvSource, sectionizeToMarkdown } from "@/lib/cv/source";
import { keywordCoverage, paperFor } from "@/lib/cv/export";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { EmptyState, PageHeader } from "@/components/kit";
import { CvStudio } from "@/components/profile/cv-studio";

export const metadata: Metadata = { title: "CV" };

/** CV templates page; `?job=<id>` adds keyword coverage against that offer. */
export default async function CvPage({ searchParams }: PageProps<"/app/profile/cv">) {
  const { t } = await getDict();
  const s = t.profile2.studio;
  const src = getCvSource();
  const back = { href: "/app/profile", label: s.back };
  if (!src.text.trim()) {
    return (
      <>
        <PageHeader title={s.title} lead={s.lead} back={back} />
        <EmptyState icon={<FileText size={22} aria-hidden="true" />} title={s.emptyTitle} hint={s.emptyHint}>
          <Link href="/app/profile" className="btn btn-primary">
            {s.goProfile}
          </Link>
        </EmptyState>
      </>
    );
  }
  const markdown = src.format === "markdown" ? src.text : sectionizeToMarkdown(src.text);
  const fileBase = (getProfile().name || "CV").normalize("NFKD").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "CV";
  const paper = paperFor(getProfileExtra().places.countries);
  const jobParam = Number((await searchParams).job);
  const job = Number.isInteger(jobParam) && jobParam > 0 ? getJob(jobParam) : null;
  const coverage = job ? { title: job.title, company: job.company, ...keywordCoverage(`${job.title}\n${job.tags.join(", ")}\n${job.description}`, markdown) } : null;
  return (
    <>
      <div className="no-print">
        <PageHeader title={s.title} lead={s.lead} back={back} />
      </div>
      <CvStudio markdown={markdown} fromUpload={src.format === "text"} fileBase={fileBase} paper={paper} coverage={coverage} />
    </>
  );
}
