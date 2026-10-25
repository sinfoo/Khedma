"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ban, CircleCheck, Search, Sparkles, Star } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { CompanyAvatar } from "@/components/kit";
import { ScoreRing, scoreLabel } from "@/components/ui";
import type { CompanyRow } from "@/lib/company";

type Sort = "open" | "fit" | "seen" | "name" | "rating";
type Flag = "" | "blacklisted" | "researched" | "notResearched";
const PAGE = 60;
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Company rows: identity, open · applied, research state, average fit. Click opens the company page. */
export function CompaniesBrowser({ rows }: { rows: CompanyRow[] }) {
  const { t, locale } = useT();
  const c = t.company2;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("open");
  const [flag, setFlag] = useState<Flag>("");
  // Hundreds of employers: 60 rows at a time, more on demand.
  const [limit, setLimit] = useState(PAGE);

  const shown = useMemo(() => {
    const needle = fold(q.trim());
    const list = rows.filter((r) => {
      const sec = r.sector || r.research?.facts.sector || "";
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
  }, [rows, q, sort, flag, locale]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-[320px]">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <label htmlFor="co-q" className="sr-only">{c.search}</label>
          <input id="co-q" type="search" className="input !h-[38px] !border-line !py-0 !pl-9 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.searchPh} />
        </div>
        <div role="radiogroup" aria-label={t.common.filter} className="seg max-w-full overflow-x-auto">
          {(["", "researched", "notResearched", "blacklisted"] as const).map((k) => (
            <button key={k || "all"} type="button" role="radio" aria-checked={flag === k} className={`seg-btn ${flag === k ? "on" : ""}`} onClick={() => setFlag(k)}>
              {k === "" ? t.common.all : c.filters[k]}
            </button>
          ))}
        </div>
        <select className="input !h-[38px] !w-auto !border-line !py-0 text-sm" aria-label={c.sort} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {(Object.keys(c.sorts) as Sort[]).map((k) => <option key={k} value={k}>{c.sorts[k]}</option>)}
        </select>
        <span className="ml-auto text-[0.78rem] text-muted tabular" aria-live="polite">{fmt(c.count, { shown: shown.length, total: rows.length })}</span>
      </div>

      {shown.length === 0 ? (
        <p className="card p-8 text-center text-muted">{c.noMatch}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.slice(0, limit).map((r, i) => {
            const sector = r.sector || r.research?.facts.sector;
            const place = r.hq || r.locations[0];
            return (
              <li key={r.slug} className="rise" style={{ ["--i" as string]: Math.min(i, 10) }}>
                <Link
                  href={`/app/companies/${r.slug}`}
                  className="card grid grid-cols-[auto_1fr_auto] items-center gap-3.5 px-3.5 py-3 transition-colors hover:border-line-strong sm:grid-cols-[auto_1fr_auto_auto]"
                  style={{ opacity: r.blacklisted ? 0.7 : 1 }}
                >
                  <CompanyAvatar name={r.name} size={40} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-ink">
                      <span className="truncate">{r.name}</span>
                      {r.blacklisted && (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-danger-soft px-[7px] py-px text-[0.68rem] font-semibold text-danger">
                          <Ban size={10} aria-hidden="true" /> {c.doNotApply}
                        </span>
                      )}
                      {r.rating > 0 && (
                        <span className="inline-flex items-center gap-px text-saffron" aria-label={fmt(c.rate, { n: r.rating })}>
                          {Array.from({ length: r.rating }, (_, k) => <Star key={k} size={11} aria-hidden="true" fill="currentColor" />)}
                        </span>
                      )}
                    </p>
                    <p className="mt-px truncate text-[0.78rem] text-muted">
                      {[sector, place, r.skills.slice(0, 3).map((s) => s.name).join(", ")].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="hidden whitespace-nowrap text-right text-[0.78rem] text-muted sm:block">
                    <p className="font-semibold text-ink">
                      {fmt(c.openOffers, { n: r.open })} · {fmt(c.applications, { n: r.applications })}
                    </p>
                    <p className={`mt-px inline-flex items-center gap-1.5 ${r.researched_at ? "text-success" : "text-saffron"}`}>
                      {r.researched_at ? <CircleCheck size={12} aria-hidden="true" /> : <Sparkles size={12} aria-hidden="true" />}
                      {r.researched_at ? c.researched : c.notResearched}
                    </p>
                  </div>
                  {r.avgFit !== null ? (
                    <ScoreRing value={r.avgFit} size={36} label={`${c.fit}: ${scoreLabel(t, r.avgFit)}`} animate={false} />
                  ) : (
                    <span className="grid size-9 place-items-center rounded-full border border-dashed border-line-strong text-[0.7rem] text-muted" aria-hidden="true">—</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > limit && (
        <div className="mt-3 flex justify-center">
          <button type="button" className="btn btn-outline" onClick={() => setLimit(limit + PAGE)}>
            {fmt(t.offers2.showMore, { n: Math.min(PAGE, shown.length - limit), left: shown.length - limit })}
          </button>
        </div>
      )}
    </>
  );
}
