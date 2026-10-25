import { pageTitle } from "@/lib/i18n/title";
import Link from "next/link";
import { getDict } from "@/lib/i18n/server";
import { listJobs } from "@/lib/db";
import { CURRENCY_SIGN, extractSalaryMentions } from "@/lib/salaries";
import { TriangleAlert } from "lucide-react";
import { CompanyAvatar } from "@/components/kit";
import { SalaryExplorer } from "@/components/insights/salary-explorer";

export const generateMetadata = pageTitle("salaries");

export default async function SalariesPage() {
  const { t, locale } = await getDict();
  const m = t.insights2.sal;
  const nf = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB");
  const seen = listJobs()
    .flatMap((j) => extractSalaryMentions(`${j.title}\n${j.description}`).slice(0, 3).map((s, i) => ({ key: `${j.id}-${i}`, job: j, s })))
    .slice(0, 40);

  return (
    <>
      <header className="mb-[18px] rise">
        <h1 className="text-[1.75rem] leading-[1.1] tracking-[-0.025em] sm:text-[2rem]">{m.title}</h1>
        {/* The scope (Tunisia only) is said up front. */}
        <p className="mt-1.5 text-ink-2">{m.lead}</p>
        <p className="mt-1.5 flex items-start gap-2 text-muted">
          <TriangleAlert size={14} aria-hidden="true" className="mt-1 shrink-0 text-saffron" />
          {m.disclaimer}
        </p>
      </header>

      <SalaryExplorer />

      <section className="card mt-[18px] p-[18px] rise" aria-labelledby="seen-h" style={{ ["--i" as string]: 6 }}>
        <h2 id="seen-h" className="eyebrow text-[0.8rem]">{m.seen}</h2>
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
                  {s.max !== s.min && `–${nf.format(s.max)}`} {CURRENCY_SIGN[s.currency] ?? s.currency}
                  {s.period && <span className="text-muted"> {s.period === "month" ? m.month : s.period === "hour" ? m.hour : m.year}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5 rise" aria-labelledby="method-h" style={{ ["--i" as string]: 7 }}>
        <h2 id="method-h" className="card-title">{m.method}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{m.methodText}</p>
      </section>
    </>
  );
}
