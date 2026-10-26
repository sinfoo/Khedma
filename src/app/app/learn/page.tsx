import { Suspense } from "react";
import Link from "next/link";
import { after } from "next/server";
import { ArrowUpRight, GraduationCap, Search, Sparkles } from "lucide-react";
import { pageTitle } from "@/lib/i18n/title";
import { getDict } from "@/lib/i18n/server";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { getProfile, listJobs } from "@/lib/db";
import { skillMatrix } from "@/lib/repo/insights";
import { getEngine } from "@/lib/ai";
import { catalogCounts, refreshCatalog, refreshState, searchCourses, staleSources } from "@/lib/learn/store";
import { aiRankCourses, recommendCourses } from "@/lib/learn/recommend";
import { FIELD_KEYS, type FieldKey } from "@/lib/learn/model";
import { DIRECTORY, SOURCE_NAMES, providerLink } from "@/lib/learn/directory";
import { CourseCard } from "@/components/learn/course-card";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/kit";
import { refreshLearn } from "@/app/actions/learn";
import type { Locale } from "@/lib/types";

export const generateMetadata = pageTitle("learn");

const PAGE = 24;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function LearnPage({ searchParams }: PageProps<"/app/learn">) {
  const sp = await searchParams;
  const { t, locale } = await getDict();
  const m = t.learn2;
  const q = one(sp.q).slice(0, 80);
  const field = FIELD_KEYS.includes(one(sp.field) as FieldKey) ? (one(sp.field) as FieldKey) : null;
  const price = (["free", "cert", "paid"] as const).find((p) => p === one(sp.price)) ?? null;
  const lang = /^[a-z]{2}$/.test(one(sp.lang)) ? one(sp.lang) : null;
  const source = one(sp.source) in SOURCE_NAMES ? one(sp.source) : null;
  const maxHours = ["5", "20", "60"].includes(one(sp.hours)) ? Number(one(sp.hours)) : null;
  const shown = Math.min(Math.max(Number(one(sp.n)) || PAGE, PAGE), 240);

  const counts = catalogCounts();
  const state = refreshState();
  // The catalogs load on first visit and refresh weekly, after the page is sent so it never waits on them.
  if (!state.running && !process.env.KHEDMA_NO_LEARN_REFRESH && staleSources().length) after(() => refreshCatalog().catch(() => {}));
  const res = searchCourses({ q, field, price, lang, source, maxHours, limit: shown });
  const filtered = !!(q || field || price || lang || source || maxHours);
  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { q: q || null, field, price, lang, source, hours: maxHours ? String(maxHours) : null, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/app/learn?${s}` : "/app/learn";
  };
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short" });

  return (
    <>
      <PageHeader
        title={m.title}
        lead={m.lead}
        actions={
          <ActionButton action={refreshLearn} pendingLabel={m.refreshing} className="btn btn-outline btn-sm">
            {m.refresh}
          </ActionButton>
        }
      />
      <div className="-mt-2 mb-5 text-[0.78rem] text-muted" role="status">
        {(state.running || !counts.total) && <p className="mb-1 font-semibold text-accent-text">{m.loading}</p>}
        {counts.total > 0 && (
          <details>
            <summary className="cursor-pointer">{fmt(m.catalog, { n: counts.total.toLocaleString(locale), s: Object.keys(counts.sources).length })}</summary>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(state.sources).map(([k, s]) => (
                <li key={k}>
                  {SOURCE_NAMES[k] ?? k} · {s.n.toLocaleString(locale)} · {s.error && !s.n ? m.failed : fmt(m.updated, { date: date(s.at) })}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <Suspense fallback={<div className="skeleton mb-6 h-48 rounded-[14px]" aria-hidden="true" />}>
        <Recommended t={t} locale={locale} empty={!counts.total} />
      </Suspense>

      <section className="mt-8" aria-labelledby="browse-h">
        <h2 id="browse-h" className="mb-3 text-[1.25rem] tracking-[-0.015em]">{m.searchTitle}</h2>
        <form action="/app/learn" method="get" className="card grid gap-3 p-4">
          <div className="flex gap-2">
            <label htmlFor="learn-q" className="sr-only">{m.search}</label>
            <input id="learn-q" name="q" defaultValue={q} placeholder={m.searchPh} className="input !h-10 min-w-0 flex-1" />
            <button type="submit" className="btn btn-primary !h-10">
              <Search size={15} aria-hidden="true" /> <span className="hidden sm:inline">{m.search}</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Select name="field" label={m.filters.field} value={field ?? ""} any={m.filters.any} options={FIELD_KEYS.map((k) => [k, `${m.fields[k]}${counts.fields[k] ? ` (${counts.fields[k]})` : ""}`])} />
            <Select name="price" label={m.filters.price} value={price ?? ""} any={m.filters.any} options={Object.entries(m.priceOpts)} />
            <Select name="lang" label={m.filters.lang} value={lang ?? ""} any={m.filters.any} options={[["en", "English"], ["fr", "Français"], ["es", "Español"], ["de", "Deutsch"], ["ar", "العربية"]]} />
            <Select name="source" label={m.filters.source} value={source ?? ""} any={m.filters.any} options={Object.keys(counts.sources).map((k) => [k, SOURCE_NAMES[k] ?? k])} />
            <Select name="hours" label={m.filters.hours} value={maxHours ? String(maxHours) : ""} any={m.filters.any} options={Object.entries(m.hoursOpts)} />
          </div>
        </form>

        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={m.filters.field}>
          {FIELD_KEYS.filter((k) => counts.fields[k]).map((k) => (
            <li key={k}>
              <Link href={qs({ field: field === k ? null : k })} aria-current={field === k ? "page" : undefined} className={`chip min-h-7 ${field === k ? "chip-accent" : ""}`}>
                {m.fields[k]} <span className="mono opacity-70">{counts.fields[k]}</span>
              </Link>
            </li>
          ))}
        </ul>

        {counts.total > 0 && (
          <>
            <p className="mt-4 text-sm text-muted" aria-live="polite">{fmt(m.results, { n: res.total })}</p>
            {res.courses.length === 0 ? (
              <p className="card mt-3 p-5 text-sm text-muted">{m.noResults}</p>
            ) : (
              <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {res.courses.map((c) => (
                  <CourseCard key={c.id} c={c} t={t} />
                ))}
              </ul>
            )}
            {res.total > res.courses.length && (
              <p className="mt-4 text-center">
                <Link href={`${qs({})}${qs({}).includes("?") ? "&" : "?"}n=${shown + PAGE}`} scroll={false} className="btn btn-outline btn-sm">{m.more}</Link>
              </p>
            )}
          </>
        )}
        {filtered && <p className="mt-3 text-[0.75rem] text-muted">{m.disclaimer}</p>}
      </section>

      <section className="mt-10" aria-labelledby="dir-h">
        <h2 id="dir-h" className="text-[1.25rem] tracking-[-0.015em]">{m.dirTitle}</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-muted">{m.dirLead}</p>
        <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {DIRECTORY.filter((p) => !field || p.fields.includes(field)).map((p) => (
            <li key={p.name} className="card flex items-start gap-3 p-3.5">
              <GraduationCap size={18} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <a href={providerLink(p, q)} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:text-accent-text">
                  {p.name} <ArrowUpRight size={13} className="inline" aria-hidden="true" />
                </a>
                <p className="mt-0.5 text-[0.75rem] text-muted">
                  {p.cost === "free" ? m.dirFree : p.cost === "paid" ? m.dirPaid : m.dirMixed}
                  {p.cert !== "none" ? ` · ${m.cert[p.cert]}` : ""} · {p.fields.slice(0, 3).map((f) => m.fields[f]).join(", ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Select({ name, label, value, any, options }: { name: string; label: string; value: string; any: string; options: [string, string][] }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[0.72rem] text-muted">
      {label}
      <select name={name} defaultValue={value} className="input !h-9 !py-0 text-sm">
        <option value="">{any}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

/** Recommendations: offline ranking from the student's gaps, re-ranked by the AI when a key is set. */
async function Recommended({ t, locale, empty }: { t: Dict; locale: Locale; empty: boolean }) {
  const m = t.learn2;
  const profile = getProfile();
  const matrix = skillMatrix(listJobs().filter((j) => !j.evaluation || j.evaluation.verdict !== "skip"));
  const gaps = matrix.rows.filter((r) => !r.have).map((r) => ({ skill: r.skill, demand: r.total }));
  const input = { gaps, roles: profile.target_roles, have: profile.skills, lang: locale };
  const base = empty ? [] : recommendCourses({ ...input, limit: 24 });
  const ai = base.length > 1 && (await getEngine(profile.settings)).online ? await aiRankCourses(profile.settings, input, base) : null;
  const recs = (ai?.recs ?? base).slice(0, 9);
  return (
    <section aria-labelledby="rec-h">
      <h2 id="rec-h" className="flex items-center gap-2 text-[1.25rem] tracking-[-0.015em]">
        <Sparkles size={18} className="text-saffron" aria-hidden="true" /> {m.recTitle}
      </h2>
      <p className="mt-1 max-w-[75ch] text-sm text-muted">{empty ? m.recNoCatalog : !gaps.length ? m.recEmpty : ai ? m.recLeadAi : m.recLeadEstimate}</p>
      {recs.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {recs.map((r) => (
            <CourseCard key={r.course.id} c={r.course} t={t} reasons={r.reasons} why={r.why} />
          ))}
        </ul>
      )}
    </section>
  );
}
