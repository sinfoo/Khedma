import { pageTitle } from "@/lib/i18n/title";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, ExternalLink, FileText, Lightbulb, Radar, Sparkles } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getProfile } from "@/lib/db";
import { needsOnboarding } from "@/lib/cv/onboarding";
import { getForYou } from "@/lib/recommend";
import { CompanyAvatar, EmptyState } from "@/components/kit";
import { OfferCard } from "@/components/discover/offer-card";
import { AdjustButton } from "@/components/discover/adjust-button";
import { AddRoleButton, AddSourceButton, RefreshButton } from "@/components/discover/buttons";
import { actionText, insightText, roleWhyText, sourceWhyText } from "@/components/discover/text";

export const generateMetadata = pageTitle("discover");

const TONE = { accent: "tone-accent", saffron: "tone-saffron", danger: "tone-danger", success: "tone-success" };

export default async function DiscoverPage() {
  const profile = getProfile();
  if (needsOnboarding(profile)) redirect("/app/welcome");
  const { t, locale } = await getDict();
  const m = t.discover2;
  const d = await getForYou(12);
  const { model } = d;
  const hasCv = !model.weaknesses.some((w) => w.key === "noCv");
  const overridden = !!model.override;
  const time = new Date(d.generatedAt).toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const maxDemand = Math.max(1, ...d.skills.map((s) => s.demand));
  const boards = d.sources.filter((s) => s.kind === "provider");
  const companies = d.sources.filter((s) => s.kind === "company");
  const href = (h: string) => (h.startsWith("#") ? `${h}-h` : h);
  const places = [...model.locations, ...(model.remoteOk ? [m.banner.remote] : [])].join(", ");
  const card = "card p-4";
  const h2 = "card-title mb-2.5 text-[0.9rem]";

  return (
    <>
      <header className="mb-[18px] flex flex-wrap items-end justify-between gap-4 rise">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-[1.1] tracking-[-0.025em] sm:text-[2rem]">{m.eyebrow}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-muted">
            {overridden ? m.banner.overridden : m.banner.detected}
            <strong className="text-ink">
              {m.fields[model.field]} · {m.levels[model.level]}
            </strong>
            · {fmt(m.banner.skills, { n: model.skills.length })}
            {places && ` · ${places}`}
            <AdjustButton field={model.field} level={model.level} overridden={overridden} />
          </div>
        </div>
        <div className="flex items-center gap-2 text-[0.78rem] text-muted">
          <span>
            {fmt(m.generatedAt, { time })} · {model.engine === "heuristic" ? t.common.heuristic : model.engine.replace("claude:", "Claude · ")}
          </span>
          <RefreshButton />
        </div>
      </header>

      {!hasCv && (
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-ink-2">{m.banner.noCv}</p>
          <Link href="/app/profile" className="btn btn-primary btn-sm">
            <FileText size={14} aria-hidden="true" /> {m.banner.addCv}
          </Link>
        </div>
      )}

      {d.actions.length > 0 && (
        <div className="mb-[22px] grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.actions.slice(0, 3).map((a, i) => (
            <Link
              key={a.key + (a.vars?.company ?? "")}
              href={href(a.href)}
              className="card lift flex items-center gap-3 px-4 py-3.5 text-ink rise"
              style={{ ["--i" as string]: i }}
            >
              <span className={`tile tile-sm ${TONE[a.tone]}`}>
                <Lightbulb size={16} aria-hidden="true" />
              </span>
              <span className="flex-1 text-sm font-semibold leading-[1.35]">{actionText(t, a.key, a.vars)}</span>
              <ArrowRight size={16} aria-hidden="true" className="text-muted" />
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <div className="mb-2.5 flex items-baseline justify-between">
            <h2 className="text-[1.2rem] tracking-[-0.015em]">{m.sections.offers}</h2>
            <Link href="/app/jobs" className="text-[0.8rem] font-semibold">{m.sections.seeAll} →</Link>
          </div>
          {d.offers.length === 0 ? (
            <EmptyState icon={<Radar aria-hidden="true" />} title={m.offer.empty} hint={m.offer.emptyHint}>
              <Link href="/app/sources?scan=1" className="btn btn-saffron btn-lg">{m.offer.emptyCta}</Link>
              <Link href="/app/jobs/new" className="btn btn-outline btn-lg">{m.offer.emptyCta2}</Link>
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {d.offers.map((o, i) => (
                <OfferCard key={o.id} offer={o} i={i} />
              ))}
            </ul>
          )}

          {d.companies.length > 0 && (
            <section className={`${card} mt-5`}>
              <h2 className={h2}>{m.sections.companies}</h2>
              <ul className="divide-y divide-line">
                {d.companies.map((c) => (
                  <li key={c.company} className="flex items-center gap-3 py-2.5">
                    <CompanyAvatar name={c.company} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.company}</p>
                      <p className="truncate text-xs text-muted">
                        {c.offers === 1 ? m.companies.offer : fmt(m.companies.offers, { n: c.offers })}
                        {c.untracked > 0 && ` · ${fmt(m.companies.untracked, { n: c.untracked })}`}
                      </p>
                    </div>
                    <span className="bar hidden !w-24 sm:block">
                      <span style={{ width: `${c.fit}%`, background: c.fit >= 60 ? "var(--success)" : "var(--accent)" }} />
                    </span>
                    <span className="mono w-10 text-right text-sm tabular">{c.fit}%</span>
                    <Link href={`/app/jobs/${c.top[0].id}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" aria-label={`${t.common.open}: ${c.top[0].title}`}>
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-3.5">
          {hasCv && (model.strengths.length > 0 || model.weaknesses.length > 0) && (
            <section className={card}>
              <h2 className={h2}>
                {m.banner.strengths} · {m.banner.weaknesses}
              </h2>
              <ul className="flex flex-col gap-1.5 text-[0.82rem]">
                {model.strengths.map((s, i) => (
                  <li key={`s${i}`} className="flex gap-2">
                    <CheckCircle2 size={14} aria-hidden="true" className="mt-[3px] shrink-0 text-success" />
                    <span>{insightText(t, s)}</span>
                  </li>
                ))}
                {model.weaknesses.map((s, i) => (
                  <li key={`w${i}`} className="flex gap-2">
                    <AlertTriangle size={14} aria-hidden="true" className="mt-[3px] shrink-0 text-saffron" />
                    <span>{insightText(t, s)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={card}>
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="card-title text-[0.9rem]">{m.sections.skills}</h2>
              <Link href="/app/upskill" className="text-[0.78rem] font-semibold">{m.sections.upskill}</Link>
            </div>
            {d.skills.length === 0 ? (
              <p className="text-sm text-muted">{m.skills.empty}</p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {d.skills.map((s) => (
                  <li key={s.skill}>
                    <div className="flex items-center gap-2 text-[0.82rem]">
                      <span className="flex-1 font-semibold">{s.skill}</span>
                      {s.proximity >= 0.8 && <span className="rounded-full bg-accent-soft px-1.5 text-[0.68rem] font-semibold text-accent-text">{m.skills.near}</span>}
                      <span className="text-[0.72rem] text-muted">{fmt(m.skills.demand, { n: s.demand })}</span>
                    </div>
                    <span className="bar mt-1">
                      <span style={{ width: `${(s.demand / maxDemand) * 100}%`, background: s.unlocks > 0 ? "var(--success)" : "var(--accent)" }} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={card}>
            <h2 className={h2}>{m.sections.roles}</h2>
            {d.roles.length === 0 ? (
              <p className="text-sm text-muted">{m.roles.empty}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {d.roles.map((r) => (
                  <li key={r.role} className="flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.85rem] font-semibold">{r.role}</p>
                      <p className="text-[0.72rem] text-muted">{roleWhyText(t, r.why)}</p>
                    </div>
                    <AddRoleButton role={r.role} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(boards.length > 0 || companies.length > 0) && (
            <section className={card}>
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="card-title text-[0.9rem]">{m.sections.sources}</h2>
                <Link href="/app/sources" className="text-[0.78rem] font-semibold">{m.sections.manageSources}</Link>
              </div>
              <ul className="divide-y divide-line">
                {boards.map((s) =>
                  s.kind === "provider" ? (
                    <li key={`${s.providerKind}:${s.handle}`} className="flex items-center gap-2.5 py-2">
                      <span className="tile tile-xs tone-muted"><Sparkles size={13} aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{s.label}</p>
                        <p className="truncate text-xs text-muted">{sourceWhyText(t, s.why)}</p>
                      </div>
                      <AddSourceButton kind={s.providerKind} handle={s.handle} label={s.label} keywords={s.keywords} />
                    </li>
                  ) : null,
                )}
                {companies.map((s) =>
                  s.kind === "company" ? (
                    <li key={s.label} className="flex items-center gap-2.5 py-2">
                      <CompanyAvatar name={s.label} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{s.label}</p>
                        <p className="truncate text-xs text-muted">{sourceWhyText(t, s.why)}</p>
                      </div>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" aria-label={`${m.sources.visit}: ${s.label}`}>
                        <Building2 size={14} aria-hidden="true" /> <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    </li>
                  ) : null,
                )}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
