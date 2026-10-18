import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getApplication, getJob } from "@/lib/db";
import { normalizeForAts } from "@/lib/cv/export";
import { getDict } from "@/lib/i18n/server";
import { Markdown } from "@/components/markdown";
import { AutoPrint } from "./auto-print";

// The browser names the saved PDF after the document title.
export async function generateMetadata({ params, searchParams }: PageProps<"/print/[id]">): Promise<Metadata> {
  const app = getApplication(Number((await params).id));
  const job = app && getJob(app.job_id);
  const { t } = await getDict();
  const doc = (await searchParams).doc === "letter" ? t.apps2.flow.packLetter : t.apps2.flow.packCv;
  return { title: { absolute: job ? `${doc} — ${job.company}` : doc }, robots: { index: false } };
}

/**
 * Bare page holding only the tailored CV or letter, so the browser's "Save as PDF" gives a clean file
 * (no shell, banners or checklists). ?doc=cv|letter
 */
export default async function PrintDoc({ params, searchParams }: PageProps<"/print/[id]">) {
  const id = Number((await params).id);
  const doc = (await searchParams).doc === "letter" ? "letter" : "cv";
  const app = Number.isInteger(id) && id > 0 ? getApplication(id) : null;
  const job = app && getJob(app.job_id);
  const raw = app && (doc === "cv" ? app.cv_md : app.cover_letter_md);
  if (!app || !job || !raw?.trim()) notFound();
  const { t } = await getDict();
  return (
    <main className="mx-auto w-full max-w-[780px] bg-white px-10 py-12 text-black print:max-w-none print:p-0">
      <AutoPrint hint={t.apps2.flow.printHint} again={t.apps2.flow.printAgain} />
      <Markdown>{normalizeForAts(raw)}</Markdown>
    </main>
  );
}
