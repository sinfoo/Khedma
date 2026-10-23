"use client";

import { useMemo, useState } from "react";
import { Check, Globe2, Search, Wifi } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { COUNTRIES, REMOTE_CODE, TN_CITIES, countryName } from "@/lib/geo";
import { fold } from "@/lib/sources/classify";

export interface Places {
  countries: string[];
  cities: string[];
  remote: "yes" | "only" | "no";
}

const FEATURED = ["TN", "FR", "DE", "CA", "BE", "CH", "NL", "GB", "AE", "QA", "MA", "US"];

/**
 * "Where do you want to apply?" — flag chips for the usual destinations of ENIT students,
 * a search for the rest, Tunisian cities when Tunisia is picked, and a remote preference.
 */
export function CountryPicker({ value, onChange, compact = false }: { value: Places; onChange: (v: Places) => void; compact?: boolean }) {
  const { t, locale } = useT();
  const c = t.profile2.places;
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const L = locale === "fr" ? "fr" : "en";
  const toggle = (code: string) =>
    onChange({ ...value, countries: value.countries.includes(code) ? value.countries.filter((x) => x !== code) : [...value.countries, code], cities: code === "TN" && value.countries.includes("TN") ? [] : value.cities });
  const toggleCity = (city: string) => onChange({ ...value, cities: value.cities.includes(city) ? value.cities.filter((x) => x !== city) : [...value.cities, city] });
  const list = useMemo(() => {
    const needle = fold(q.trim());
    const base = showAll || needle ? COUNTRIES : COUNTRIES.filter((x) => FEATURED.includes(x.code));
    return needle ? COUNTRIES.filter((x) => fold(`${x.fr} ${x.en} ${x.code}`).includes(needle)) : base;
  }, [q, showAll]);
  const summary = value.countries.map((code) => countryName(code, L)).join(", ");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">
          {value.countries.length ? (
            <>
              <span className="font-semibold text-ink">{value.countries.length}</span> {c.selected}: {summary}
            </>
          ) : (
            c.none
          )}
        </p>
        <label className="relative">
          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input !w-44 !py-1.5 !pl-8 text-sm" placeholder={c.search} aria-label={c.search} />
        </label>
      </div>

      <ul className={`grid gap-1.5 ${compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`} aria-label={c.countries}>
        {list.map((x) => {
          const on = value.countries.includes(x.code);
          return (
            <li key={x.code}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(x.code)}
                className={`group flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition-all ${
                  on ? "border-accent bg-accent-soft text-ink shadow-[inset_0_0_0_1px_var(--accent)]" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:-translate-y-px"
                }`}
              >
                <span aria-hidden="true" className="text-lg leading-none">{x.flag}</span>
                <span className="min-w-0 flex-1 truncate">{x[L]}</span>
                {on && <Check size={14} aria-hidden="true" className="text-accent-text" />}
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            aria-pressed={value.remote === "only"}
            onClick={() => onChange({ ...value, remote: value.remote === "only" ? "yes" : "only" })}
            className={`flex w-full items-center gap-2 rounded-xl border border-dashed px-2.5 py-2 text-left text-sm transition-all ${
              value.remote === "only" ? "border-accent bg-accent-soft text-ink" : "border-line-strong text-ink-2 hover:-translate-y-px"
            }`}
          >
            <Wifi size={16} aria-hidden="true" className="text-accent-text" />
            <span className="min-w-0 flex-1 truncate">{c.remoteOnly}</span>
          </button>
        </li>
      </ul>
      {!q && !showAll && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll(true)}>
          <Globe2 size={14} aria-hidden="true" /> {c.more}
        </button>
      )}

      {value.countries.includes("TN") && (
        <div className="rounded-xl border border-line bg-surface-2/60 p-3">
          <p className="mb-2 text-xs font-semibold text-ink-2">{c.cities}</p>
          <div className="flex flex-wrap gap-1.5">
            {TN_CITIES.map((city) => {
              const on = value.cities.includes(city);
              return (
                <button key={city} type="button" aria-pressed={on} onClick={() => toggleCity(city)} className={`chip transition-colors ${on ? "chip-accent" : "hover:border-line-strong"}`}>
                  {city}
                </button>
              );
            })}
          </div>
          <p className="hint">{c.citiesHint}</p>
        </div>
      )}

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1.5 text-xs font-semibold text-ink-2">{c.remote}</legend>
        {(["yes", "only", "no"] as const).map((r) => (
          <label key={r} className={`chip cursor-pointer min-h-7 ${value.remote === r ? "chip-accent" : ""}`}>
            <input type="radio" name="remote-pref" className="sr-only" checked={value.remote === r} onChange={() => onChange({ ...value, remote: r })} />
            {r === "yes" ? c.remoteYes : r === "only" ? c.remoteOnly : c.remoteNo}
          </label>
        ))}
      </fieldset>
      <span className="sr-only" aria-live="polite">{summary}{value.remote === "only" ? ` · ${c.remoteOnly}` : ""}{value.countries.includes(REMOTE_CODE) ? "" : ""}</span>
    </div>
  );
}
