import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { EmptyState, PageHeader } from "@/components/kit";
import { CompaniesBrowser } from "@/components/company/companies-browser";
import { ResearchTopButton } from "@/components/company/company-actions";
import { CheckOffersButton } from "@/components/company/liveness-button";
import { listCompanies } from "@/lib/company";

export const metadata: Metadata = { title: "Companies" };

export default async function CompaniesPage() {
  const { t } = await getDict();
  const c = t.company2;
  const rows = listCompanies();

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title={c.title} />
        <EmptyState icon={<Building2 size={22} aria-hidden="true" />} title={c.emptyTitle} hint={c.emptyHint}>
          <Link href="/app/jobs/new" className="btn btn-primary">
            <Plus size={16} aria-hidden="true" /> {c.goOffers}
          </Link>
        </EmptyState>
      </>
    );
  }

  const open = rows.reduce((n, r) => n + r.open, 0);
  const researched = rows.filter((r) => r.researched_at).length;
  const remaining = rows.filter((r) => !r.researched_at && !r.blacklisted).length;

  return (
    <>
      <PageHeader
        title={c.title}
        lead={fmt(c.lead, { n: rows.length, open, r: researched })}
        actions={
          <>
            <CheckOffersButton />
            <ResearchTopButton n={5} remaining={remaining} />
          </>
        }
      />
      <CompaniesBrowser rows={rows} />
    </>
  );
}
