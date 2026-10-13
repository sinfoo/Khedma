import type { Metadata } from "next";
import Link from "next/link";
import { getDict } from "@/lib/i18n/server";
import { listJobs } from "@/lib/db";
import { extractSalaryMentions } from "@/lib/salaries";
import { CompanyAvatar, PageHeader } from "@/components/kit";
import { SalaryExplorer } from "@/components/insights/salary-explorer";

export const metadata: Metadata = { title: "Salaries" };

export default async function SalariesPage() {
  const { t, locale } = await getDict();
  const m = t.insights2.sal;
  const nf = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB");
  const seen = listJobs()
    .flatMap((j) => extractSalaryMentions(`${j.title}\n${j.description}`).slice(0, 3).map((s, i) => ({ key: `${j.id}-${i}`, job: j, s })))
    .slice(0, 40);

  return (
    <>
      <PageHeader title={m.title} lead={m.lead} />
      <p role="note" className="mb-6 rounded-xl border border-saffron/40 bg-saffron-soft px-4 py-3 text-sm text-ink rise" style={{ ["--i" as string]: 1 }}>
        <strong className="font-semibold">⚠ </strong>
        {m.disclaimer}
      </p>

      <SalaryExplorer />

      <section className="card mt-6 p-5 rise" aria-labelledby="seen-h" style={{ ["--i" as string]: 6 }}>
        <h2 id="seen-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{m.seen}</h2>
        <p className="mt-0.5 text-xs text-muted">{m.seenDesc}</p>
        {seen.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{m.seenEmpty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {seen.map(({ key, job, s }) => (
              <li key={key} className="flex flex-wrap items-center gap-3 py-2.5">
                <CompanyAvatar name={job.company} size={30} />
                <div className="min-w-0 flex-1">
                  <Link href={`/app/jobs/${job.id}`} className="block truncate text-sm font-medium hover:text-accent-text">{job.title}</Link>
                  <p className="truncate text-xs text-muted">{job.company} · <q className="italic">{s.raw}</q></p>
                </div>
                <span className="mono text-sm tabular">
                  {nf.format(s.min)}
                  {s.max !== s.min && `–${nf.format(s.max)}`} {s.currency === "EUR" ? "€" : "DT"}
                  {s.period && <span className="text-muted"> {s.period === "month" ? m.month : m.year}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rise" aria-labelledby="method-h" style={{ ["--i" as string]: 7 }}>
        <h2 id="method-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{m.method}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{m.methodText}</p>
      </section>
    </>
  );
}
