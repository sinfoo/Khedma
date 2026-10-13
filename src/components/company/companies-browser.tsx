"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ban, MapPin, Search, Sparkles, Star } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { CompanyAvatar } from "@/components/kit";
import { ScoreRing, fmtDate, scoreLabel } from "@/components/ui";
import type { CompanyRow } from "@/lib/company";

type Sort = "open" | "fit" | "seen" | "name" | "rating";
type Flag = "" | "blacklisted" | "researched" | "notResearched";
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function CompaniesBrowser({ rows }: { rows: CompanyRow[] }) {
  const { t, locale } = useT();
  const c = t.company2;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("open");
  const [sector, setSector] = useState("");
  const [flag, setFlag] = useState<Flag>("");

  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector || r.research?.facts.sector).filter(Boolean) as string[])].sort(), [rows]);
  const shown = useMemo(() => {
    const needle = fold(q.trim());
    const list = rows.filter((r) => {
      const sec = r.sector || r.research?.facts.sector || "";
      if (sector && sec !== sector) return false;
      if (flag === "blacklisted" && !r.blacklisted) return false;
      if (flag === "researched" && !r.researched_at) return false;
      if (flag === "notResearched" && r.researched_at) return false;
      if (!needle) return true;
      return fold(`${r.name} ${sec} ${r.hq} ${r.locations.join(" ")} ${r.skills.map((s) => s.name).join(" ")}`).includes(needle);
    });
    const by: Record<Sort, (a: CompanyRow, b: CompanyRow) => number> = {
      open: (a, b) => b.open - a.open || b.lastSeen.localeCompare(a.lastSeen),
      fit: (a, b) => (b.avgFit ?? -1) - (a.avgFit ?? -1) || b.open - a.open,
      seen: (a, b) => b.lastSeen.localeCompare(a.lastSeen),
      name: (a, b) => a.name.localeCompare(b.name, locale),
      rating: (a, b) => b.rating - a.rating || b.open - a.open,
    };
    return list.sort(by[sort]);
  }, [rows, q, sort, sector, flag, locale]);

  const active = q || sector || flag;

  return (
    <>
      <div className="card mb-5 flex flex-wrap items-end gap-3 p-3 rise" style={{ ["--i" as string]: 1 }}>
        <div className="min-w-0 flex-1 basis-56">
          <label className="label" htmlFor="co-q">{c.search}</label>
          <div className="relative">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input id="co-q" type="search" className="input !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.searchPh} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="co-sort">{c.sort}</label>
          <select id="co-sort" className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {(Object.keys(c.sorts) as Sort[]).map((k) => <option key={k} value={k}>{c.sorts[k]}</option>)}
          </select>
        </div>
        {sectors.length > 0 && (
          <div>
            <label className="label" htmlFor="co-sector">{c.filters.sector}</label>
            <select id="co-sector" className="input" value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">{c.filters.allSectors}</option>
              {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="co-flag">{t.common.filter}</label>
          <select id="co-flag" className="input" value={flag} onChange={(e) => setFlag(e.target.value as Flag)}>
            <option value="">{t.common.all}</option>
            <option value="researched">{c.filters.researched}</option>
            <option value="notResearched">{c.filters.notResearched}</option>
            <option value="blacklisted">{c.filters.blacklisted}</option>
          </select>
        </div>
        {active && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQ(""); setSector(""); setFlag(""); }}>
            {c.filters.clear}
          </button>
        )}
      </div>

      <p className="mb-3 text-sm text-muted tabular" aria-live="polite">{fmt(c.count, { shown: shown.length, total: rows.length })}</p>

      {shown.length === 0 ? (
        <p className="card p-8 text-center text-muted">{c.noMatch}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r, i) => (
            <li key={r.slug} className="rise" style={{ ["--i" as string]: Math.min(i + 2, 12) }}>
              <Link href={`/app/companies/${r.slug}`} className="card card-hover flex h-full flex-col gap-3 p-4" aria-label={r.name}>
                <div className="flex items-start gap-3">
                  <CompanyAvatar name={r.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{r.name}</p>
                    <p className="truncate text-xs text-muted">
                      {(r.sector || r.research?.facts.sector) ?? ""}
                      {(r.hq || r.locations[0]) && (
                        <span className="inline-flex items-center gap-1">{(r.sector || r.research?.facts.sector) && " · "}<MapPin size={11} aria-hidden="true" />{r.hq || r.locations[0]}</span>
                      )}
                    </p>
                  </div>
                  {r.avgFit !== null && <ScoreRing value={r.avgFit} size={40} label={`${c.fit}: ${scoreLabel(t, r.avgFit)}`} animate={false} />}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={`chip ${r.open ? "chip-accent" : ""}`}>{r.open ? fmt(c.openOffers, { n: r.open }) : c.noOpen}</span>
                  {r.blacklisted && <span className="chip chip-danger"><Ban size={11} aria-hidden="true" /> {c.doNotApply}</span>}
                  {r.researched_at && <span className="chip chip-success"><Sparkles size={11} aria-hidden="true" /> {c.researched}</span>}
                  {r.applications > 0 && <span className="chip">{fmt(c.applications, { n: r.applications })}</span>}
                </div>
                {r.skills.length > 0 && (
                  <p className="truncate text-xs text-muted">{r.skills.slice(0, 5).map((s) => s.name).join(" · ")}</p>
                )}
                <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted">
                  <span className="tabular">{c.lastSeen} {fmtDate(r.lastSeen, locale)}</span>
                  {r.rating > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-saffron" aria-label={fmt(c.rate, { n: r.rating })}>
                      {Array.from({ length: r.rating }, (_, k) => <Star key={k} size={12} aria-hidden="true" fill="currentColor" />)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
