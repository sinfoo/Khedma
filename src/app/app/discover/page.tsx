import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Compass,
  ExternalLink,
  FileText,
  Flag,
  Lightbulb,
  Radar,
  Sparkles,
  Target,
} from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getProfile } from "@/lib/db";
import { needsOnboarding } from "@/lib/cv/onboarding";
import { getForYou } from "@/lib/recommend";
import { CompanyAvatar, EmptyState, PageHeader, Progress, Section } from "@/components/kit";
import { EngineChip } from "@/components/ui";
import { OfferCard } from "@/components/discover/offer-card";
import { AdjustButton } from "@/components/discover/adjust-button";
import { AddRoleButton, AddSourceButton, RefreshButton } from "@/components/discover/buttons";
import { actionText, insightText, roleWhyText, sourceWhyText } from "@/components/discover/text";

export const metadata: Metadata = { title: "Discover" };

const TONE = {
  accent: "bg-accent-soft text-accent-text",
  saffron: "bg-saffron-soft text-saffron",
  danger: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
};

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
  // Section anchors: <Section id="x"> puts the id on its heading ("x-h").
  const href = (h: string) => (h.startsWith("#") ? `${h}-h` : h);

  return (
    <>
      <PageHeader
        eyebrow={m.eyebrow}
        title={m.title}
        lead={m.lead}
        actions={
          <>
            <span className="text-xs text-muted">{fmt(m.generatedAt, { time })}</span>
            <RefreshButton />
          </>
        }
      />

      {/* Profile reading banner */}
      <section className="card relative mb-6 overflow-hidden p-5 rise" style={{ ["--i" as string]: 1 }} aria-labelledby="reading-h">
        <div className="pattern pattern-fade" aria-hidden="true" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p id="reading-h" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                {overridden ? m.banner.overridden : m.banner.detected}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="chip chip-accent text-sm !px-3 !py-1">
                  <Compass size={14} aria-hidden="true" /> <span className="sr-only">{m.banner.field}: </span>
                  {m.fields[model.field]}
                </span>
                {model.altField && <span className="chip">+ {m.fields[model.altField]}</span>}
                <span className="chip chip-saffron text-sm !px-3 !py-1">
                  <Flag size={14} aria-hidden="true" /> <span className="sr-only">{m.banner.level}: </span>
                  {m.levels[model.level]}
                </span>
              </div>
              <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                <span className="tabular">{fmt(m.banner.skills, { n: model.skills.length })}</span>
                {model.seniorityMonths > 0 && <span className="tabular">{fmt(m.banner.months, { n: model.seniorityMonths })}</span>}
                {model.languages.length > 0 && <span className="tabular">{fmt(m.banner.langs, { n: model.languages.length })}</span>}
                {(model.locations.length > 0 || model.remoteOk) && (
                  <span>{fmt(m.banner.locations, { list: [...model.locations, ...(model.remoteOk ? [m.banner.remote] : [])].join(", ") })}</span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{m.engineHint}</span>
              <EngineChip engine={model.engine} t={t} />
              <AdjustButton field={model.field} level={model.level} overridden={overridden} />
            </div>
          </div>

          {hasCv ? (
            (model.strengths.length > 0 || model.weaknesses.length > 0) && (
              <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                <div>
                  <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-success" style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.1em" }}>
                    {m.banner.strengths}
                  </h2>
                  <ul className="space-y-1 text-sm">
                    {model.strengths.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <CheckCircle2 size={14} aria-hidden="true" className="mt-[3px] shrink-0 text-success" />
                        <span>{insightText(t, s)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-saffron" style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.1em" }}>
                    {m.banner.weaknesses}
                  </h2>
                  <ul className="space-y-1 text-sm">
                    {model.weaknesses.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <AlertTriangle size={14} aria-hidden="true" className="mt-[3px] shrink-0 text-saffron" />
                        <span>{insightText(t, s)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-sm text-ink-2">{m.banner.noCv}</p>
              <Link href="/app/profile" className="btn btn-primary btn-sm">
                <FileText size={14} aria-hidden="true" /> {m.banner.addCv}
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Next actions */}
      <Section id="actions" title={m.sections.actions} i={2} className="mb-6">
        {d.actions.length === 0 ? (
          <p className="text-sm text-muted">
            <span className="font-medium text-ink">{m.actions.empty}</span> — {m.actions.emptyHint}
          </p>
        ) : (
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {d.actions.map((a) => (
              <li key={a.key + (a.vars?.company ?? "")}>
                <Link href={href(a.href)} className="flex h-full items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:border-line-strong hover:bg-surface-2">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${TONE[a.tone]}`} aria-hidden="true">
                    <Lightbulb size={16} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{actionText(t, a.key, a.vars)}</span>
                  <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <Section
            id="offers"
            title={m.sections.offers}
            i={3}
            actions={<Link href="/app/jobs" className="btn btn-ghost btn-sm">{m.sections.seeAll} <ArrowRight size={14} aria-hidden="true" /></Link>}
          >
            {d.offers.length === 0 ? (
              <EmptyState icon={<Radar size={22} aria-hidden="true" />} title={m.offer.empty} hint={m.offer.emptyHint}>
                <Link href="/app/sources" className="btn btn-primary">{m.offer.emptyCta}</Link>
                <Link href="/app/jobs/new" className="btn btn-secondary">{m.offer.emptyCta2}</Link>
              </EmptyState>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {d.offers.map((o, i) => (
                  <OfferCard key={o.id} offer={o} i={i + 1} />
                ))}
              </ul>
            )}
          </Section>

          <Section id="companies" title={m.sections.companies} i={4}>
            {d.companies.length === 0 ? (
              <p className="text-sm text-muted">
                <span className="font-medium text-ink">{m.companies.empty}</span> — {m.companies.emptyHint}
              </p>
            ) : (
              <ul className="-my-1 divide-y divide-line">
                {d.companies.map((c) => (
                  <li key={c.company} className="flex items-center gap-3 py-3">
                    <CompanyAvatar name={c.company} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.company}</p>
                      <p className="truncate text-xs text-muted">
                        {c.offers === 1 ? m.companies.offer : fmt(m.companies.offers, { n: c.offers })}
                        {c.untracked > 0 && ` · ${fmt(m.companies.untracked, { n: c.untracked })}`}
                        {c.fields.length > 0 && ` · ${c.fields.map((f) => m.fields[f]).join(", ")}`}
                      </p>
                    </div>
                    <div className="hidden w-28 sm:block">
                      <Progress value={c.fit} label={`${m.companies.fit} ${c.fit}%`} tone={c.fit >= 60 ? "success" : "accent"} />
                    </div>
                    <span className="mono tabular w-10 text-right text-sm">{c.fit}%</span>
                    <Link href={`/app/jobs/${c.top[0].id}`} className="btn btn-ghost btn-sm btn-icon" aria-label={`${t.common.open}: ${c.top[0].title}`}>
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-6">
          <Section id="roles" title={m.sections.roles} i={5}>
            {d.roles.length === 0 ? (
              <p className="text-sm text-muted">{m.roles.empty}</p>
            ) : (
              <ul className="-my-1 divide-y divide-line">
                {d.roles.map((r) => (
                  <li key={r.role} className="py-3">
                    <div className="flex items-start gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text" aria-hidden="true">
                        <Target size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{r.role}</p>
                        <p className="text-xs text-muted">{roleWhyText(t, r.why)}</p>
                        <p className="mt-1.5 flex flex-wrap gap-1">
                          {r.keywords.map((k) => (
                            <span key={k} className="chip !py-0 text-[0.7rem]">{k}</span>
                          ))}
                        </p>
                      </div>
                      <AddRoleButton role={r.role} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            id="skills"
            title={m.sections.skills}
            i={6}
            actions={<Link href="/app/upskill" className="btn btn-ghost btn-sm">{m.sections.upskill}</Link>}
          >
            {d.skills.length === 0 ? (
              <p className="text-sm text-muted">
                <span className="font-medium text-ink">{m.skills.empty}</span> — {m.skills.emptyHint}
              </p>
            ) : (
              <ol className="space-y-2.5">
                {d.skills.map((s) => (
                  <li key={s.skill}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <BookOpen size={14} aria-hidden="true" className="shrink-0 text-muted" />
                        <span className="font-medium">{s.skill}</span>
                        {s.proximity >= 0.8 && <span className="chip chip-accent !py-0 text-[0.7rem]">{m.skills.near}</span>}
                      </span>
                      <span className="ml-auto text-xs text-muted tabular">
                        {fmt(m.skills.demand, { n: s.demand })}
                        {s.unlocks > 0 && ` · ${s.unlocks === 1 ? m.skills.unlocksOne : fmt(m.skills.unlocks, { n: s.unlocks })}`}
                      </span>
                    </div>
                    <div className="mt-1">
                      <Progress value={s.demand} max={maxDemand} label={`${s.skill}: ${fmt(m.skills.demand, { n: s.demand })}`} tone={s.unlocks > 0 ? "success" : "accent"} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section
            id="sources"
            title={m.sections.sources}
            i={7}
            actions={<Link href="/app/sources" className="btn btn-ghost btn-sm">{m.sections.manageSources}</Link>}
          >
            {d.sources.length === 0 ? (
              <p className="text-sm text-muted">{m.sources.empty}</p>
            ) : (
              <div className="space-y-4">
                {boards.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted" style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.1em" }}>
                      {m.sources.boards}
                    </h3>
                    <ul className="-my-1 divide-y divide-line">
                      {boards.map((s) =>
                        s.kind === "provider" ? (
                          <li key={`${s.providerKind}:${s.handle}`} className="flex items-center gap-3 py-2.5">
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2" aria-hidden="true">
                              <Sparkles size={15} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{s.label}</p>
                              <p className="truncate text-xs text-muted">{sourceWhyText(t, s.why)}</p>
                            </div>
                            <AddSourceButton kind={s.providerKind} handle={s.handle} label={s.label} keywords={s.keywords} />
                          </li>
                        ) : null,
                      )}
                    </ul>
                  </div>
                )}
                {companies.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted" style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.1em" }}>
                      {m.sources.companies}
                    </h3>
                    <ul className="-my-1 divide-y divide-line">
                      {companies.map((s) =>
                        s.kind === "company" ? (
                          <li key={s.label} className="flex items-center gap-3 py-2.5">
                            <CompanyAvatar name={s.label} size={32} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{s.label}</p>
                              <p className="truncate text-xs text-muted">{sourceWhyText(t, s.why)}</p>
                            </div>
                            <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" aria-label={`${m.sources.visit}: ${s.label}`}>
                              <Building2 size={14} aria-hidden="true" /> <span className="hidden sm:inline">{m.sources.visit}</span>
                              <ExternalLink size={12} aria-hidden="true" />
                            </a>
                          </li>
                        ) : null,
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
