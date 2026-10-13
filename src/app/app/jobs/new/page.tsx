import type { Metadata } from "next";
import { getDict } from "@/lib/i18n/server";
import { PageHeader } from "@/components/kit";
import { AddOffer } from "@/components/offers/add-offer";

export const metadata: Metadata = { title: "Add offer" };

export default async function NewJobPage() {
  const { t } = await getDict();
  return (
    <>
      <PageHeader title={t.offers2.newTitle} lead={t.offers2.newLead} back={{ href: "/app/jobs", label: t.offers2.back }} />
      <AddOffer />
    </>
  );
}
