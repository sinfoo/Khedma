import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Radar, SearchX, Sparkles } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { getProfile } from "@/lib/db";
import { COUNTRIES, REGIONS } from "@/lib/geo";
import type { Locale } from "@/lib/types";
import { docsFor } from "@/lib/bourses/checklist";
import { EMPTY_CRITERIA, activeCount, criteriaFromQuery, criteriaToQuery, inferCriteria, type Criteria } from "@/lib/bourses/criteria";
import { todayYmd } from "@/lib/bourses/deadline";
import { FEEDS } from "@/lib/bourses/feeds";
import { TRACK_STATUSES, type Bourse, type Tracking } from "@/lib/bourses/model";
import { SORTS, evaluate, facets, rank, sortRanked, type Ranked, type Sort } from "@/lib/bourses/rank";
import { allBourses, lastCriteria, listTracking, scanState } from "@/lib/bourses/store";
import { EmptyState, LinkTabs, PageHeader } from "@/components/kit";
import { BourseCard, MatchRing, hostText } from "@/components/bourses/bourse-card";
import { CriteriaBar, type Option } from "@/components/bourses/criteria-bar";
import { ScanPanel } from "@/components/bourses/scan-panel";
import { basisText, chipTone, countryLabel, dateTimeLabel, deadlineText, languageLabel, reasonText, regionLabel } from "@/components/bourses/text";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict()).t.bourses2.title };
}

const PAGE = 24;
const TABS = ["programs", "calls", "mine"] as const;
type Tab = (typeof TABS)[number];
type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function BoursesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams;
  const { t, locale } = await getDict();
  const m = t.bourses2;
  const today = todayYmd();
  const tab: Tab = TABS.find((x) => x === one(sp.tab)) ?? "programs";
  const sort: Sort = SORTS.find((x) => x === one(sp.sort)) ?? "match";
  const shown = Math.min(Math.max(Number(one(sp.n)) || PAGE, PAGE), 480);

  // The URL wins; without criteria in it, the last search; before any search, a guess from the profile.
  const inferred = inferCriteria(getProfile(), today);
  const fromUrl = criteriaFromQuery(sp);
  const stored = fromUrl ? null : lastCriteria();
  const criteria = fromUrl ?? stored ?? inferred.criteria;
  const basis = basisText(t, inferred.stage, inferred.criteria);
  const note = fromUrl ? null : stored ? m.criteria.sourceSaved : basis ? fmt(m.criteria.sourceProfile, { basis }) : m.criteria.sourceProfileNone;

  const { programs, calls } = allBourses(today);
  const openCalls = calls.filter((c) => !c.closed);
  const tracking = listTracking();
  const statusOf = (id: string) => tracking.find((x) => x.item === id)?.status ?? null;
  const href = (patch: { tab?: Tab; sort?: Sort; n?: number; criteria?: Criteria }) => {
    const p = criteriaToQuery(patch.criteria ?? criteria);
    const next = { tab: patch.tab ?? tab, sort: patch.sort ?? sort };
    if (next.tab !== "programs") p.set("tab", next.tab);
    if (next.sort !== "match") p.set("sort", next.sort);
    if (patch.n) p.set("n", String(patch.n));
    return `/app/bourses?${p}`;
  };

  const header = (
    <>
      <PageHeader title={m.title} lead={m.lead} />
      <LinkTabs
        label={m.tabs.label}
        current={tab}
        tabs={[
          { key: "programs", href: href({ tab: "programs" }), label: m.tabs.programs, count: programs.length },
          { key: "calls", href: href({ tab: "calls" }), label: m.tabs.calls, count: openCalls.length },
          { key: "mine", href: href({ tab: "mine" }), label: m.tabs.mine, count: tracking.length },
        ]}
      />
    </>
  );

  if (tab === "mine")
    return (
      <>
        {header}
        <Mine t={t} locale={locale} tracking={tracking} all={[...programs, ...calls]} criteria={criteria} today={today} searchHref={href({ tab: "programs" })} />
      </>
    );

  const pool = tab === "calls" ? openCalls : programs;
  const ranked = sortRanked(rank(pool, criteria, today), sort);
  const counts = facets(pool, criteria, today);
  const scan = scanState();
  const feedLabel = (id?: string) => FEEDS.find((f) => f.id === id)?.label ?? id;

  // Choices the catalogue can answer, plus whatever is already picked (so a filter never vanishes from the bar).
  const any = counts.countries["*"] ?? 0;
  const hostCodes = new Set([...pool.flatMap((b) => b.hostCountries), ...criteria.destinations].filter((c) => /^[A-Z]{2}$/.test(c)));
  const countries: Option[] = [...hostCodes].map((c) => ({ value: c, label: countryLabel(c, locale), n: (counts.countries[c] ?? 0) + any })).sort((a, b) => a.label.localeCompare(b.label, locale));
  const regions: Option[] = REGIONS.map((r) => ({ value: r.key, label: regionLabel(t, r.key) }));
  const langCodes = new Set([...pool.flatMap((b) => b.languages), ...criteria.languages, ...inferred.criteria.languages]);
  const languages: Option[] = [...langCodes].map((l) => ({ value: l, label: languageLabel(l, locale), n: counts.languages[l] ?? 0 })).sort((a, b) => (b.n ?? 0) - (a.n ?? 0) || a.label.localeCompare(b.label, locale));
  const natCodes = new Set(["TN", criteria.nationality, ...COUNTRIES.map((c) => c.code)]);
  const nationalities: Option[] = [...natCodes].map((c) => ({ value: c, label: countryLabel(c, locale) })).sort((a, b) => (a.value === "TN" ? -1 : b.value === "TN" ? 1 : a.label.localeCompare(b.label, locale)));

  // Recommendations ignore the current filters: they answer "what fits my profile", with the reasons.
  const recs = tab === "programs" ? rank([...programs, ...openCalls], inferred.criteria, today).slice(0, 3) : [];

  return (
    <>
      {header}
      <CriteriaBar criteria={criteria} defaults={inferred.criteria} note={note} tab={tab} sort={sort} counts={counts} regions={regions} countries={countries} languages={languages} nationalities={nationalities} />

      {tab === "calls" && FEEDS.length > 0 && (
        <div className="mt-4">
          <ScanPanel feeds={FEEDS.map((f) => ({ id: f.id, label: f.label }))} last={scan.feeds} lastLabel={scan.at ? dateTimeLabel(scan.at, locale) : null} />
        </div>
      )}

      {recs.length > 0 && (
        <section className="mt-6" aria-labelledby="rec-h">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="rec-h" className="flex items-center gap-2 text-[1.25rem] tracking-[-0.015em]">
                <Sparkles size={18} className="text-saffron" aria-hidden="true" /> {m.rec.title}
              </h2>
              <p className="mt-1 max-w-[75ch] text-sm text-muted">{basis ? fmt(m.rec.lead, { basis }) : m.rec.leadNone}</p>
            </div>
            {basis ? (
              <Link href={href({ criteria: inferred.criteria, tab: "programs" })} className="btn btn-outline btn-sm">{m.rec.use}</Link>
            ) : (
              <Link href="/app/profile" className="btn btn-outline btn-sm">{m.rec.profile}</Link>
            )}
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {recs.map((r) => (
              <RecCard key={r.item.id} r={r} t={t} locale={locale} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-7" aria-labelledby="results-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="results-h" className="text-[1.25rem] tracking-[-0.015em]">
            {m.results.title} <span className="text-base font-normal text-muted" aria-live="polite">· {fmt(m.results.count, { n: ranked.length })}</span>
          </h2>
          {ranked.length > 1 && (
            <nav aria-label={m.results.sort} className="flex max-w-full items-center gap-2 overflow-x-auto text-sm text-muted">
              <span aria-hidden="true" className="hidden sm:inline">{m.results.sort}</span>
              <span className="seg seg-sm">
                {SORTS.map((s) => (
                  <Link key={s} href={href({ sort: s })} scroll={false} aria-current={sort === s ? "true" : undefined} className="seg-btn">{m.results.sorts[s]}</Link>
                ))}
              </span>
            </nav>
          )}
        </div>

        {ranked.length > 0 ? (
          <>
            <ul className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {ranked.slice(0, shown).map((r, i) => (
                <BourseCard key={r.item.id} r={r} t={t} locale={locale} nationality={criteria.nationality} status={statusOf(r.item.id)} i={i} feed={feedLabel(r.item.feed)} />
              ))}
            </ul>
            {ranked.length > shown && (
              <p className="mt-4 text-center">
                <Link href={href({ n: shown + PAGE })} scroll={false} className="btn btn-outline btn-sm">{m.results.more}</Link>
              </p>
            )}
          </>
        ) : pool.length > 0 ? (
          <EmptyState icon={<SearchX />} title={m.empty.filtered.title} hint={fmt(m.empty.filtered.hint, { n: pool.length })}>
            {activeCount(criteria) > 0 && <Link href={href({ criteria: EMPTY_CRITERIA })} className="btn btn-primary">{m.criteria.clear}</Link>}
          </EmptyState>
        ) : tab === "programs" ? (
          <EmptyState icon={<GraduationCap />} title={m.empty.noCatalog.title} hint={m.empty.noCatalog.hint}>
            <Link href={href({ tab: "calls" })} className="btn btn-primary">{m.tabs.calls}</Link>
          </EmptyState>
        ) : !FEEDS.length ? (
          <EmptyState icon={<Radar />} title={m.empty.noFeeds.title} hint={m.empty.noFeeds.hint}>
            <Link href={href({ tab: "programs" })} className="btn btn-primary">{m.tabs.programs}</Link>
          </EmptyState>
        ) : (
          <EmptyState icon={<Radar />} title={scan.at ? m.empty.noCalls.title : m.empty.neverScanned.title} hint={scan.at ? m.empty.noCalls.hint : m.empty.neverScanned.hint} />
        )}
      </section>
    </>
  );
}

/** A recommendation: the score, what it is and the top reasons, in words. */
function RecCard({ r, t, locale }: { r: Ranked; t: Dict; locale: Locale }) {
  const m = t.bourses2;
  const dl = deadlineText(t, r.deadline, locale, r.item.kind);
  return (
    <li className="card flex gap-3.5 p-4">
      <MatchRing score={r.score} label={fmt(m.card.matchLabel, { n: r.score })} />
      <div className="min-w-0">
        <h3 className="text-[0.95rem] font-semibold leading-snug">
          <Link href={`/app/bourses/${r.item.id}`} className="text-ink hover:text-accent-text">{r.item.name}</Link>
        </h3>
        <p className="mt-0.5 text-[0.78rem] text-muted">{r.item.provider} · {hostText(t, r.item.hostCountries, locale, 2)}</p>
        <ul className="mt-2 grid gap-1 text-[0.82rem] text-ink-2">
          {r.reasons.slice(0, 4).map((x) => (
            <li key={x.key} className="flex gap-2">
              <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
              {reasonText(t, x, locale)}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          <span className={chipTone(dl.tone)}>{dl.label}</span>
        </p>
      </div>
    </li>
  );
}

/** Tracked scholarships by status, the nearest deadline first. */
function Mine({ t, locale, tracking, all, criteria, today, searchHref }: { t: Dict; locale: Locale; tracking: Tracking[]; all: Bourse[]; criteria: Criteria; today: string; searchHref: string }) {
  const m = t.bourses2;
  if (!tracking.length)
    return (
      <EmptyState icon={<GraduationCap />} title={m.empty.mine.title} hint={m.empty.mine.hint}>
        <Link href={searchHref} className="btn btn-primary">{m.empty.mine.cta}</Link>
      </EmptyState>
    );
  const rows = tracking.map((tr) => {
    const item = all.find((b) => b.id === tr.item) ?? null;
    const verdict = item ? evaluate(item, criteria, today) : null;
    // Closed live calls and unknown dates go last.
    const due = verdict?.deadline.date && !(item?.kind === "call" && verdict.deadline.status === "closed") ? verdict.deadline.date : "9999";
    return { tr, item, verdict, due };
  });
  return (
    <>
      <p className="mb-5 max-w-2xl text-sm text-muted">{m.mine.lead}</p>
      <div className="grid gap-6">
        {(["preparing", "saved", "applied", "accepted", "rejected"] satisfies (typeof TRACK_STATUSES)[number][]).map((status) => {
          const group = rows.filter((x) => x.tr.status === status).sort((a, b) => a.due.localeCompare(b.due) || a.tr.item.localeCompare(b.tr.item));
          if (!group.length) return null;
          return (
            <section key={status} aria-labelledby={`mine-${status}`}>
              <h2 id={`mine-${status}`} className="mb-2 flex items-center gap-2 text-[1.05rem]">
                {m.statuses[status]} <span className="chip !px-1.5 !py-0 text-[0.7rem]">{group.length}</span>
              </h2>
              <ul className="grid gap-2">
                {group.map(({ tr, item, verdict }) => {
                  const docs = docsFor(item?.levels ?? [], item?.providerType === "government");
                  const ready = docs.filter((k) => tr.checklist[k]).length;
                  const dl = item && verdict ? deadlineText(t, verdict.deadline, locale, item.kind) : null;
                  return (
                    <li key={tr.item} className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                      <div className="min-w-0 flex-1 basis-64">
                        <Link href={`/app/bourses/${tr.item}`} className="font-semibold text-ink hover:text-accent-text">{item?.name ?? tr.item}</Link>
                        <p className="mt-0.5 text-[0.8rem] text-muted">{item ? `${item.provider} · ${hostText(t, item.hostCountries, locale)}` : m.mine.goneHint}</p>
                      </div>
                      <span className="text-[0.8rem] text-muted">{fmt(m.mine.docs, { done: ready, n: docs.length })}</span>
                      {dl ? (
                        <span className={chipTone(dl.tone)}>
                          {dl.label}
                          {dl.detail && <span className="font-normal opacity-80">· {dl.detail}</span>}
                        </span>
                      ) : (
                        <span className="chip">{m.mine.gone}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
