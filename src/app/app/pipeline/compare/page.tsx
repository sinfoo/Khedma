import type { Metadata } from "next";
import Link from "next/link";
import { GitCompareArrows } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getApplication, getJob, getProfile, latestEvaluation } from "@/lib/db";
import { companySlug, getCompany } from "@/lib/company";
import { getCompareWeights, getRatings, localDate } from "@/lib/repo/apps";
import { scoreDims } from "@/lib/apps/compare";
import { EmptyState, PageHeader } from "@/components/kit";
import { CompareTable, type CompareRow } from "@/components/pipeline/compare";
import { shortDate } from "@/components/pipeline/format";

export const metadata: Metadata = { title: "Compare" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t, locale } = await getDict();
  const c = t.apps2.compare;
  const sp = await searchParams;
  const ids = [...new Set(String(sp.ids ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 4);
  const profile = getProfile();
  const ratings = getRatings();
  const today = localDate(new Date());

  const rows: CompareRow[] = [];
  for (const id of ids) {
    const app = getApplication(id);
    const job = app && getJob(app.job_id);
    if (!app || !job) continue;
    const ev = latestEvaluation(job.id);
    const company = getCompany(companySlug(job.company));
    const personal = ratings[id] ?? 0;
    const { scores, salary, daysLeft } = scoreDims({
      job,
      evaluation: ev,
      status: app.status,
      applied_at: app.applied_at,
      companyRating: company?.rating ?? 0,
      personalRating: personal,
      targetLocations: profile.target_locations,
      targetTypes: profile.target_types,
      today,
    });
    rows.push({
      id,
      title: job.title,
      company: job.company,
      status: app.status,
      scores,
      personalRating: personal,
      facts: {
        fit: ev ? `${t.verdicts[ev.verdict]} · ${ev.engine === "heuristic" ? t.common.heuristic : ev.engine}` : t.jobs.notEvaluated,
        salary: salary !== null ? `≈ ${salary.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")} DT ${t.insights2.sal.month}` : c.unknown,
        location: [job.remote ? c.remote : "", job.location].filter(Boolean).join(" · ") || c.unknown,
        type: t.jobTypes[job.type],
        company: company?.rating ? "★".repeat(company.rating) : c.unrated,
        speed: app.applied_at ? `${t.states[app.status]} · ${shortDate(app.applied_at, locale)}` : t.states[app.status],
        deadline: job.deadline ? `${shortDate(job.deadline, locale)}${daysLeft !== null ? ` · ${fmt(c.days, { n: daysLeft })}` : ""}` : c.noDeadline,
      },
    });
  }

  return (
    <>
      <PageHeader eyebrow={c.eyebrow} title={c.title} lead={c.lead} back={{ href: "/app/pipeline?view=table", label: c.back }} />
      {rows.length < 2 ? (
        <EmptyState icon={<GitCompareArrows size={22} aria-hidden="true" />} title={c.needTwo}>
          <Link href="/app/pipeline?view=table" className="btn btn-primary">{c.back}</Link>
        </EmptyState>
      ) : (
        <div className="rise" style={{ ["--i" as string]: 1 }}>
          <CompareTable rows={rows} weights={getCompareWeights()} />
        </div>
      )}
    </>
  );
}
