import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, Briefcase, ExternalLink, Globe, MapPin, Sparkles } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { CompanyAvatar, EmptyState, LinkTabs } from "@/components/kit";
import { EngineChip, ScoreRing, StateChip, VerdictChip, fmtDate, scoreLabel } from "@/components/ui";
import { BlacklistToggle, RatingStars, ResearchButton } from "@/components/company/company-actions";
import { applyTo } from "@/app/actions/jobs";
import { CheckOffersButton, LivenessButton } from "@/components/company/liveness-button";
import { DetailsForm } from "@/components/company/details-form";
import { AskCompany } from "@/components/company/ask-company";
import { companyJobs, getChecks, getCompany } from "@/lib/company";

const TABS = ["overview", "offers", "applications", "notes", "ask"] as const;
type Tab = (typeof TABS)[number];
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const SLUG = /^[a-z0-9-]{1,80}$/;
const daysAgo = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = SLUG.test(slug) ? getCompany(slug) : null;
  return { title: c ? c.name : "Company" };
}

export default async function CompanyPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const c = SLUG.test(slug) ? getCompany(slug) : null;
  if (!c) notFound();
  const { t, locale } = await getDict();
  const m = t.company2;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const href = (k: Tab) => (k === "overview" ? `/app/companies/${c.slug}` : `/app/companies/${c.slug}?tab=${k}`);
  const jobs = companyJobs(c.slug);
  const apps = jobs.filter((j) => j.application);
  const checks = getChecks(jobs.map((j) => j.id));
  const r = c.research;
  const facts = r?.facts;
  const summary = r && !r.error && r.summary.what ? r.summary : null;
  const days = daysAgo(c.researched_at);
  const sector = c.sector || facts?.sector || "";
  const hq = c.hq || facts?.hq || "";
  const links: { key: string; href: string; label: string }[] = [
    c.website && { key: "web", href: c.website, label: m.website },
    c.careers_url && { key: "careers", href: c.careers_url, label: m.careers },
    facts?.social.linkedin && { key: "li", href: facts.social.linkedin, label: m.linkedin },
    facts?.social.glassdoor && { key: "gd", href: facts.social.glassdoor, label: m.glassdoor },
    facts?.social.github && { key: "gh", href: facts.social.github, label: m.github },
  ].filter(Boolean) as { key: string; href: string; label: string }[];

  return (
    <>
      <Link href="/app/companies" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink no-print">
        <ArrowLeft size={15} aria-hidden="true" /> {m.back}
      </Link>

      <header className="mb-6 rise">
        <div className="flex flex-wrap items-start gap-4">
          <CompanyAvatar name={c.name} size={56} />
          <div className="min-w-0 flex-1 basis-72">
            <h1 className="text-[1.6rem] leading-tight sm:text-[2rem]">{c.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
              {sector && <span className="chip">{sector}</span>}
              {hq && <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden="true" />{hq}</span>}
              <span className="inline-flex items-center gap-1 tabular"><Briefcase size={14} aria-hidden="true" />{c.open ? fmt(m.openOffers, { n: c.open }) : m.noOpen}</span>
              {c.blacklisted && (
                <span className="chip chip-danger" title={c.blacklist_reason || undefined}>
                  <Ban size={12} aria-hidden="true" /> {m.doNotApply}
                </span>
              )}
              {c.researched_at ? (
                <span className="chip chip-success"><Sparkles size={12} aria-hidden="true" /> {days ? fmt(m.researchedAgo, { d: days }) : m.researchedToday}</span>
              ) : (
                <span className="chip">{m.notResearched}</span>
              )}
            </div>
            {links.length > 0 && (
              <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-sm" aria-label={m.overview.links}>
                {links.map((l) => (
                  <li key={l.key}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                      {l.key === "web" ? <Globe size={13} aria-hidden="true" /> : <ExternalLink size={13} aria-hidden="true" />} {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {c.avgFit !== null && (
            <div className="hidden items-center gap-3 sm:flex">
              <ScoreRing value={c.avgFit} size={64} label={`${m.fit}: ${scoreLabel(t, c.avgFit)}`} />
            </div>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 no-print">
          {/* The AI research is a side tool, not the page's main action. */}
          <ResearchButton slug={c.slug} researched={!!summary} className="btn btn-secondary" />
          <span className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1">
            <span className="text-xs font-medium text-muted">{m.rating}</span>
            <RatingStars slug={c.slug} rating={c.rating} />
          </span>
          <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-line sm:block" />
          <BlacklistToggle slug={c.slug} name={c.name} blacklisted={c.blacklisted} />
        </div>
      </header>

      <LinkTabs
        label={m.tabsLabel}
        current={tab}
        tabs={[
          { key: "overview", href: href("overview"), label: m.tabs.overview },
          { key: "offers", href: href("offers"), label: m.tabs.offers, count: jobs.length },
          { key: "applications", href: href("applications"), label: m.tabs.applications, count: apps.length },
          { key: "notes", href: href("notes"), label: m.tabs.notes },
          { key: "ask", href: href("ask"), label: m.tabs.ask },
        ]}
      />

      {tab === "overview" && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {summary ? (
              <>
                <article className="card p-6 rise" style={{ ["--i" as string]: 1 }} aria-labelledby="sum-h">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 id="sum-h" className="text-lg">{m.overview.summary}</h2>
                    <EngineChip engine={summary.engine} t={t} />
                  </div>
                  <p className="text-[0.95rem] leading-relaxed text-ink-2">{summary.what}</p>
                  {summary.lookFor && (
                    <>
                      <h3 className="mb-2 mt-5 text-base">{m.overview.lookFor}</h3>
                      <p className="text-[0.95rem] leading-relaxed text-ink-2">{summary.lookFor}</p>
                    </>
                  )}
                </article>
                {summary.standOut.length > 0 && (
                  <section className="card p-6 rise" style={{ ["--i" as string]: 2 }} aria-labelledby="so-h">
                    <h2 id="so-h" className="mb-3 text-lg">{m.overview.standOut}</h2>
                    <ol className="space-y-2.5">
                      {summary.standOut.map((s, i) => (
                        <li key={i} className="flex gap-3 text-[0.95rem] leading-relaxed">
                          <span className="mono mt-0.5 shrink-0 text-xs font-semibold text-accent-text tabular">{String(i + 1).padStart(2, "0")}</span>
                          <span className="text-ink-2">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                {summary.questions.length > 0 && (
                  <section className="card p-6 rise" style={{ ["--i" as string]: 3 }} aria-labelledby="qa-h">
                    <h2 id="qa-h" className="mb-3 text-lg">{m.overview.questions}</h2>
                    <ul className="space-y-2">
                      {summary.questions.map((q, i) => (
                        <li key={i} className="rounded-lg bg-surface-2 px-3.5 py-2.5 text-[0.95rem] text-ink-2">{q}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            ) : r?.error ? (
              <section className="card p-6 rise" aria-labelledby="err-h">
                <h2 id="err-h" className="text-lg">{m.overview.errorTitle}</h2>
                <p className="mt-2 text-sm text-muted">{r.error === "no website" ? m.noWebsite : r.error}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ResearchButton slug={c.slug} researched={true} className="btn btn-primary" />
                  <Link href={href("notes")} className="btn btn-secondary">{m.tabs.notes}</Link>
                </div>
              </section>
            ) : (
              <EmptyState icon={<Sparkles size={22} aria-hidden="true" />} title={m.overview.emptyTitle} hint={m.overview.emptyHint}>
                <ResearchButton slug={c.slug} researched={false} />
                {!c.website && <Link href={href("notes")} className="btn btn-secondary">{m.notes.website}</Link>}
              </EmptyState>
            )}
          </div>

          <aside className="space-y-4">
            <section className="card p-5 rise" style={{ ["--i" as string]: 2 }} aria-labelledby="facts-h">
              <h2 id="facts-h" className="text-xs font-semibold uppercase tracking-wide text-muted">{m.overview.facts}</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  [m.overview.sector, sector],
                  [m.overview.size, c.size || facts?.size],
                  [m.overview.hq, hq],
                  [m.firstSeen, fmtDate(c.firstSeen, locale)],
                  [m.lastSeen, fmtDate(c.lastSeen, locale)],
                  [m.tabs.applications, String(c.applications)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium tabular">{v || m.overview.unknown}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {c.skills.length > 0 && (
              <section className="card p-5 rise" style={{ ["--i" as string]: 3 }} aria-labelledby="asked-h">
                <h2 id="asked-h" className="text-xs font-semibold uppercase tracking-wide text-muted">{m.overview.asked}</h2>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {c.skills.map((s) => (
                    <li key={s.name} className="chip">{s.name}{s.n > 1 && <span className="text-muted tabular"> ×{s.n}</span>}</li>
                  ))}
                </ul>
              </section>
            )}
            {facts && facts.tech.length > 0 && (
              <section className="card p-5 rise" style={{ ["--i" as string]: 4 }} aria-labelledby="tech-h">
                <h2 id="tech-h" className="text-xs font-semibold uppercase tracking-wide text-muted">{m.overview.tech}</h2>
                <ul className="mt-3 flex flex-wrap gap-1.5">{facts.tech.map((s) => <li key={s} className="chip">{s}</li>)}</ul>
              </section>
            )}
            {facts && facts.culture.length > 0 && (
              <section className="card p-5 rise" style={{ ["--i" as string]: 5 }} aria-labelledby="cult-h">
                <h2 id="cult-h" className="text-xs font-semibold uppercase tracking-wide text-muted">{m.overview.culture}</h2>
                <ul className="mt-3 flex flex-wrap gap-1.5">{facts.culture.map((s) => <li key={s} className="chip chip-accent">{s}</li>)}</ul>
              </section>
            )}
            {facts && facts.pages.length > 0 && (
              <section className="card p-5 rise" style={{ ["--i" as string]: 6 }} aria-labelledby="pages-h">
                <h2 id="pages-h" className="text-xs font-semibold uppercase tracking-wide text-muted">{m.overview.pages}</h2>
                <ul className="mt-3 space-y-1 text-xs">
                  {facts.pages.map((p) => (
                    <li key={p} className="truncate">
                      <a href={p} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">{p.replace(/^https?:\/\/(www\.)?/, "")}</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}

      {tab === "offers" && (
        <section className="card overflow-hidden rise" aria-labelledby="off-h">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 id="off-h" className="text-lg">{m.offers.title}</h2>
            {jobs.some((j) => !j.archived && /^https?:\/\//.test(j.url)) && <CheckOffersButton slug={c.slug} className="btn btn-secondary btn-sm" />}
          </div>
          {jobs.length === 0 ? (
            <p className="p-8 text-center text-muted">{m.offers.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th scope="col">{t.offers2.col.offer}</th>
                    <th scope="col">{t.offers2.col.type}</th>
                    <th scope="col">{m.offers.score}</th>
                    <th scope="col">{t.offers2.col.status}</th>
                    <th scope="col">{m.offers.liveness}</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const ck = checks.get(j.id);
                    return (
                      <tr key={j.id} className={j.archived ? "opacity-60" : ""}>
                        <td>
                          <Link href={`/app/jobs/${j.id}`} className="font-medium text-ink hover:text-accent-text">{j.title}</Link>
                          <span className="mt-0.5 block text-xs text-muted">
                            {j.location || (j.remote ? t.common.remote : "")}{j.location || j.remote ? " · " : ""}{fmtDate(j.posted_at ?? j.created_at, locale)}
                            {j.archived && <span className="chip ml-2 !py-0 text-[0.7rem]">{m.offers.archivedChip}</span>}
                          </span>
                        </td>
                        <td><span className="chip">{t.jobTypes[j.type]}</span></td>
                        <td>
                          {j.evaluation ? (
                            <span className="inline-flex items-center gap-2">
                              <ScoreRing value={j.evaluation.global} size={36} label={scoreLabel(t, j.evaluation.global)} animate={false} />
                              <VerdictChip verdict={j.evaluation.verdict} t={t} />
                            </span>
                          ) : (
                            <span className="text-xs text-muted">{t.offers2.notEvaluated}</span>
                          )}
                        </td>
                        <td>
                          {j.application ? (
                            <Link href={`/app/pipeline/${j.application.id}`}><StateChip state={j.application.status} t={t} /></Link>
                          ) : j.archived ? (
                            <span className="text-xs text-muted">—</span>
                          ) : (
                            <form action={applyTo.bind(null, j.id)}>
                              <button type="submit" className="btn btn-primary btn-sm" aria-label={`${t.offers2.apply}: ${j.title}`}>{t.offers2.apply}</button>
                            </form>
                          )}
                        </td>
                        <td>{/^https?:\/\//.test(j.url) ? <LivenessButton jobId={j.id} initial={ck ?? null} /> : <span className="text-xs text-muted">{m.offers.unknown}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "applications" && (
        <section aria-labelledby="apps-h" className="space-y-3">
          <h2 id="apps-h" className="sr-only">{m.apps.title}</h2>
          {apps.length === 0 ? (
            <EmptyState icon={<Briefcase size={22} aria-hidden="true" />} title={m.apps.empty} hint={m.apps.emptyHint}>
              <Link href={href("offers")} className="btn btn-primary">{m.tabs.offers}</Link>
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {apps.map((j, i) => {
                const a = j.application!;
                return (
                  <li key={a.id} className="card flex flex-wrap items-center gap-4 p-4 rise" style={{ ["--i" as string]: i + 1 }}>
                    <div className="min-w-0 flex-1 basis-60">
                      <p className="truncate font-semibold text-ink">{j.title}</p>
                      <p className="mt-0.5 text-xs text-muted tabular">
                        {a.applied_at ? `${m.apps.applied} ${fmtDate(a.applied_at, locale)} · ` : ""}{m.apps.updated} {fmtDate(a.updated_at, locale)}
                      </p>
                    </div>
                    <StateChip state={a.status} t={t} />
                    {j.evaluation && <ScoreRing value={j.evaluation.global} size={36} label={scoreLabel(t, j.evaluation.global)} animate={false} />}
                    <Link href={`/app/pipeline/${a.id}`} className="btn btn-secondary btn-sm">{m.apps.open}</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "notes" && <DetailsForm company={c} />}

      {tab === "ask" && <AskCompany slug={c.slug} />}
    </>
  );
}
