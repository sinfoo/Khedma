"use client";

import { useId, useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Search, UserRound, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { EMPTY_CRITERIA, FUNDINGS, activeCount, criteriaToQuery, type Criteria, type DeadlineWindow } from "@/lib/bourses/criteria";
import { STUDY_FIELDS, STUDY_LEVELS } from "@/lib/bourses/types";
import { rememberCriteria } from "@/app/actions/bourses";

/** A choice with its label already in the interface language, and how many results it would give. */
export interface Option {
  value: string;
  label: string;
  n?: number;
}

const FEES = [0, 30, 100] as const;
const CLOSING = [30, 60, 90] as const;

/** A filter button that opens a list of choices (native popover: Esc and a click outside close it, focus returns). */
function Pick({ label, count, wide, children }: { label: string; count: number; wide?: boolean; children: React.ReactNode }) {
  const id = useId().replace(/:/g, "");
  const anchor = `--pick-${id}`;
  return (
    <>
      <button type="button" popoverTarget={`pick-${id}`} className="input flex !h-10 min-w-0 items-center gap-1.5 !py-0 text-left text-sm" style={{ anchorName: anchor } as React.CSSProperties}>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count > 0 && <span className="chip chip-accent !px-1.5 !py-0 text-[0.7rem]">{count}</span>}
        <ChevronDown size={14} className="shrink-0 text-muted" aria-hidden="true" />
      </button>
      <div
        id={`pick-${id}`}
        popover="auto"
        role="group"
        aria-label={label}
        className={`menu max-h-[min(22rem,70dvh)] ${wide ? "w-[min(22rem,calc(100vw-2rem))]" : "w-[min(17rem,calc(100vw-2rem))]"}`}
        style={{ positionAnchor: anchor, top: "anchor(bottom)", left: "anchor(left)", marginTop: 6, positionTryFallbacks: "flip-inline, flip-block" } as React.CSSProperties}
      >
        {children}
      </div>
    </>
  );
}

function Check({ option, checked, onChange }: { option: Option; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="menu-item cursor-pointer">
      <input type="checkbox" className="size-4 shrink-0 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 flex-1">{option.label}</span>
      {option.n !== undefined && <span className="mono text-[0.72rem] text-muted">{option.n}</span>}
    </label>
  );
}

const Heading = ({ children }: { children: React.ReactNode }) => <p className="px-2.5 pb-1 pt-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">{children}</p>;

/**
 * The search criteria. Every change goes to the URL (so a search can be bookmarked and the Back button works) and is
 * remembered for the next visit. Values guessed from the profile arrive as ordinary, editable filters.
 */
export function CriteriaBar({
  criteria,
  defaults,
  note,
  tab,
  sort,
  counts,
  regions,
  countries,
  languages,
  nationalities,
}: {
  criteria: Criteria;
  /** The guess from the profile, applied by "From my profile". */
  defaults: Criteria;
  /** Where the current values come from, when not from the URL. */
  note: string | null;
  tab: string;
  sort: string;
  counts: { levels: Record<string, number>; fields: Record<string, number>; funding: Record<string, number> };
  regions: Option[];
  countries: Option[];
  languages: Option[];
  nationalities: Option[];
}) {
  const { t } = useT();
  const m = t.bourses2;
  const mc = m.criteria;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [c, setC] = useOptimistic(criteria);
  const qId = useId();
  const natId = useId();
  const ageId = useId();

  const apply = (next: Criteria) => {
    const p = criteriaToQuery(next);
    if (tab !== "programs") p.set("tab", tab);
    if (sort !== "match") p.set("sort", sort);
    start(() => {
      setC(next);
      router.replace(`/app/bourses?${p}`, { scroll: false });
    });
    void rememberCriteria(next);
  };
  const toggle = (key: "levels" | "fields" | "destinations" | "funding" | "languages", value: string, on: boolean) => {
    const rest = (c[key] as string[]).filter((x) => x !== value);
    apply({ ...c, [key]: on ? [...rest, value] : rest } as Criteria);
  };
  const setAge = (raw: string) => {
    const n = Number(raw);
    const age = raw.trim() && Number.isInteger(n) && n >= 10 && n <= 99 ? n : null;
    if (age !== c.age) apply({ ...c, age });
  };

  const levelOpts: Option[] = STUDY_LEVELS.map((v) => ({ value: v, label: m.levels[v], n: counts.levels[v] ?? 0 }));
  const fieldOpts: Option[] = STUDY_FIELDS.map((v) => ({ value: v, label: m.fields[v], n: counts.fields[v] ?? 0 }));
  const fundingOpts: Option[] = FUNDINGS.map((v) => ({ value: v, label: m.funding[v], n: counts.funding[v] ?? 0 }));
  const destLabel = (d: string) => [...regions, ...countries].find((o) => o.value === d)?.label ?? d;
  const langLabel = (l: string) => languages.find((o) => o.value === l)?.label ?? l.toUpperCase();
  const natLabel = nationalities.find((o) => o.value === c.nationality)?.label ?? c.nationality;
  const windowLabel = (w: DeadlineWindow, days = c.closingDays) => fmt(mc.windowOpts[w], { n: days });

  // One removable chip per active filter.
  const chips: { key: string; label: string; next: Criteria }[] = [
    ...(c.q ? [{ key: "q", label: fmt(mc.chips.q, { q: c.q }), next: { ...c, q: "" } }] : []),
    ...c.fields.map((v) => ({ key: `f-${v}`, label: m.fields[v], next: { ...c, fields: c.fields.filter((x) => x !== v) } })),
    ...c.levels.map((v) => ({ key: `l-${v}`, label: m.levels[v], next: { ...c, levels: c.levels.filter((x) => x !== v) } })),
    ...c.destinations.map((v) => ({ key: `d-${v}`, label: destLabel(v), next: { ...c, destinations: c.destinations.filter((x) => x !== v) } })),
    ...(c.fullOnly ? [{ key: "full", label: mc.fullOnly, next: { ...c, fullOnly: false } }] : []),
    ...c.funding.map((v) => ({ key: `$-${v}`, label: m.funding[v], next: { ...c, funding: c.funding.filter((x) => x !== v) } })),
    ...(c.maxFee !== null ? [{ key: "fee", label: c.maxFee === 0 ? mc.chips.free : fmt(mc.chips.maxFee, { n: c.maxFee }), next: { ...c, maxFee: null } }] : []),
    ...c.languages.map((v) => ({ key: `g-${v}`, label: langLabel(v), next: { ...c, languages: c.languages.filter((x) => x !== v) } })),
    ...(c.window !== "any" ? [{ key: "when", label: windowLabel(c.window), next: { ...c, window: "any" as const } }] : []),
    ...(c.nationality !== "TN" ? [{ key: "nat", label: fmt(mc.chips.nationality, { country: natLabel }), next: { ...c, nationality: "TN" } }] : []),
    ...(c.age !== null ? [{ key: "age", label: fmt(mc.chips.age, { n: c.age }), next: { ...c, age: null } }] : []),
  ];
  const windowValue = c.window === "closing" ? `closing:${c.closingDays}` : c.window;

  return (
    <section aria-labelledby="bourses-criteria" aria-busy={pending} className="card grid gap-3 p-4">
      <h2 id="bourses-criteria" className="sr-only">{mc.title}</h2>
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ ...c, q: String(new FormData(e.currentTarget).get("q") ?? "").trim().slice(0, 80) });
        }}
      >
        <label htmlFor={qId} className="sr-only">{mc.q}</label>
        <input id={qId} key={c.q} name="q" type="search" defaultValue={c.q} placeholder={mc.qPh} maxLength={80} className="input !h-10 min-w-0 flex-1" />
        <button type="submit" className="btn btn-primary !h-10">
          {pending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
          <span className="hidden sm:inline">{mc.search}</span>
          <span className="sr-only sm:hidden">{mc.search}</span>
        </button>
      </form>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Pick label={mc.field} count={c.fields.length} wide>
          {fieldOpts.map((o) => (
            <Check key={o.value} option={o} checked={(c.fields as string[]).includes(o.value)} onChange={(on) => toggle("fields", o.value, on)} />
          ))}
        </Pick>
        <Pick label={mc.level} count={c.levels.length}>
          {levelOpts.map((o) => (
            <Check key={o.value} option={o} checked={(c.levels as string[]).includes(o.value)} onChange={(on) => toggle("levels", o.value, on)} />
          ))}
        </Pick>
        <Pick label={mc.destination} count={c.destinations.length} wide>
          <Heading>{mc.regions}</Heading>
          {regions.map((o) => (
            <Check key={o.value} option={o} checked={c.destinations.includes(o.value)} onChange={(on) => toggle("destinations", o.value, on)} />
          ))}
          <Heading>{mc.countries}</Heading>
          {countries.length === 0 && <p className="px-2.5 pb-2 text-sm text-muted">{mc.noOptions}</p>}
          {countries.map((o) => (
            <Check key={o.value} option={o} checked={c.destinations.includes(o.value)} onChange={(on) => toggle("destinations", o.value, on)} />
          ))}
        </Pick>
        <Pick label={mc.funding} count={c.funding.length + (c.fullOnly ? 1 : 0)}>
          <Check option={{ value: "full-only", label: mc.fullOnly }} checked={c.fullOnly} onChange={(on) => apply({ ...c, fullOnly: on })} />
          <hr className="my-1 border-line" />
          {fundingOpts.map((o) => (
            <Check key={o.value} option={o} checked={(c.funding as string[]).includes(o.value)} onChange={(on) => toggle("funding", o.value, on)} />
          ))}
        </Pick>
        <label className="min-w-0">
          <span className="sr-only">{mc.fee}</span>
          <select className="input !h-10 !py-0 text-sm" value={c.maxFee === null ? "" : String(c.maxFee)} onChange={(e) => apply({ ...c, maxFee: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">{mc.fee}</option>
            {/* A maximum that came from the URL and is not one of the presets still shows. */}
            {[...new Set([...FEES, ...(c.maxFee === null ? [] : [c.maxFee])])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>{n === 0 ? mc.feeOpts.free : fmt(mc.feeOpts.max, { n })}</option>
            ))}
          </select>
        </label>
        <Pick label={mc.language} count={c.languages.length}>
          {languages.length === 0 && <p className="px-2.5 py-2 text-sm text-muted">{mc.noOptions}</p>}
          {languages.map((o) => (
            <Check key={o.value} option={o} checked={c.languages.includes(o.value)} onChange={(on) => toggle("languages", o.value, on)} />
          ))}
        </Pick>
        <label className="min-w-0">
          <span className="sr-only">{mc.deadline}</span>
          <select
            className="input !h-10 !py-0 text-sm"
            value={windowValue}
            onChange={(e) => {
              const [w, days] = e.target.value.split(":");
              apply({ ...c, window: w as DeadlineWindow, closingDays: days ? Number(days) : 30 });
            }}
          >
            <option value="any">{mc.deadline}</option>
            <option value="open">{mc.windowOpts.open}</option>
            {[...new Set([...CLOSING, ...(c.window === "closing" ? [c.closingDays] : [])])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={`closing:${n}`}>{windowLabel("closing", n)}</option>
            ))}
            <option value="soon">{mc.windowOpts.soon}</option>
          </select>
        </label>
        <Pick label={mc.about} count={(c.nationality !== "TN" ? 1 : 0) + (c.age !== null ? 1 : 0)} wide>
          <div className="grid gap-3 p-2.5">
            <div>
              <label htmlFor={natId} className="label">{mc.nationality}</label>
              <select id={natId} className="input !h-10 !py-0 text-sm" value={c.nationality} onChange={(e) => apply({ ...c, nationality: e.target.value })}>
                {nationalities.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ageId} className="label">{mc.age}</label>
              <input
                id={ageId}
                key={c.age ?? "none"}
                type="number"
                inputMode="numeric"
                min={10}
                max={99}
                defaultValue={c.age ?? ""}
                aria-describedby={`${ageId}-hint`}
                className="input !h-10 text-sm"
                onBlur={(e) => setAge(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setAge(e.currentTarget.value)}
              />
              <p id={`${ageId}-hint`} className="hint">{mc.ageHint}</p>
            </div>
          </div>
        </Pick>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {chips.length > 0 ? (
          <ul aria-label={mc.active} className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button type="button" className="chip chip-accent min-h-7 hover:opacity-80" aria-label={fmt(mc.remove, { label: chip.label })} onClick={() => apply(chip.next)}>
                  {chip.label} <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{mc.none}</p>
        )}
        <span className="ml-auto flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => apply(defaults)}>
            <UserRound size={13} aria-hidden="true" /> {mc.fromProfile}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={activeCount(c) === 0} onClick={() => apply(EMPTY_CRITERIA)}>
            {mc.clear}
          </button>
        </span>
      </div>
      {note && <p className="text-[0.8rem] text-muted">{note}</p>}
      <p role="status" className="sr-only">{pending ? mc.updating : ""}</p>
    </section>
  );
}
