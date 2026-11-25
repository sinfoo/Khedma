import Link from "next/link";
import { Check } from "lucide-react";
import { fmt, type Dict } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/types";
import type { TrackStatus } from "@/lib/bourses/model";
import type { Ranked } from "@/lib/bourses/rank";
import { WhyPopover } from "@/components/discover/why-popover";
import { SaveBourse } from "./save-button";
import { chipTone, countryLabel, dateLabel, deadlineText, eligibilityText, feeLabel, moneyLabel, reasonText } from "./text";

export const COVER_KEYS = ["tuition", "stipend", "travel", "insurance", "housing"] as const;

/** Match score as a ring, the same dial Discover uses for its fit score. */
export function MatchRing({ score, label, size = 52 }: { score: number; label: string; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <span role="img" aria-label={label} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(c * score) / 100} ${c}`} />
      </svg>
      <span className="mono absolute text-[0.75rem] font-semibold">{score}%</span>
    </span>
  );
}

/** Host countries in words: up to three names, "country of your choice", or "not stated". */
export function hostText(t: Dict, hosts: string[], locale: Locale, max = 3): string {
  const m = t.bourses2.card;
  if (!hosts.length) return m.countryUnknown;
  if (hosts.includes("*")) return m.anyCountry;
  const names = hosts.slice(0, max).map((h) => countryLabel(h, locale)).join(", ");
  return hosts.length > max ? `${names} ${fmt(m.moreCountries, { n: hosts.length - max })}` : names;
}

/** One scholarship in a list: what it is, what it pays, when it closes, how well it matches and why. */
export function BourseCard({ r, t, locale, nationality, status, i = 0, feed }: { r: Ranked; t: Dict; locale: Locale; nationality: string; status: TrackStatus | null; i?: number; feed?: string }) {
  const b = r.item;
  const m = t.bourses2;
  const dl = deadlineText(t, r.deadline, locale, b.kind);
  const el = eligibilityText(t, r.eligibility, nationality, locale);
  const reasons = r.reasons.map((x) => reasonText(t, x, locale));
  const covered = b.covers ? COVER_KEYS.filter((k) => b.covers![k]).map((k) => m.covers[k]) : [];
  const money = moneyLabel(t, b, locale);
  const fee = feeLabel(t, b);

  return (
    <li className="card grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2.5 px-4 py-3.5 rise" style={{ ["--i" as string]: Math.min(i, 8) }}>
      <MatchRing score={r.score} label={fmt(m.card.matchLabel, { n: r.score })} />
      <div className="min-w-0">
        <h3 className="text-[0.98rem] font-semibold leading-snug">
          <Link href={`/app/bourses/${b.id}`} className="text-ink hover:text-accent-text">{b.name}</Link>
        </h3>
        <p className="mt-0.5 text-[0.8rem] text-muted">
          {b.kind === "call" ? fmt(m.card.via, { feed: feed ?? b.provider }) : b.provider} · {hostText(t, b.hostCountries, locale)}
          {b.published && ` · ${dateLabel(b.published, locale, { day: "numeric", month: "short" })}`}
        </p>
        {/* Our own two sentences: they carry what the facts cannot, like "only your school can nominate you". */}
        {b.summary[locale] && <p className="mt-1.5 line-clamp-2 text-[0.82rem] leading-relaxed text-ink-2">{b.summary[locale]}</p>}
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {b.kind === "call" && <li className="chip chip-accent">{m.card.call}</li>}
          {b.levels.length ? b.levels.map((l) => <li key={l} className="chip">{m.levels[l]}</li>) : <li className="chip">{m.card.levelUnknown}</li>}
          <li className={chipTone(b.funding === "full" ? "success" : "")}>{b.funding ? m.funding[b.funding] : m.card.fundingUnknown}</li>
          <li className={chipTone(dl.tone)}>
            {dl.label}
            {dl.detail && <span className="font-normal opacity-80">· {dl.detail}</span>}
          </li>
        </ul>
        <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-2">
          {covered.length > 0 && (
            <>
              <span className="text-muted">{m.card.covers}:</span> {covered.join(", ")}
              {(money || fee) && " · "}
            </>
          )}
          {money && <strong className="font-semibold text-ink">{money}</strong>}
          {money && fee && " · "}
          {fee}
        </p>
        <p className={`mt-1 flex items-center gap-1 text-[0.78rem] ${el.tone === "danger" ? "text-danger" : "text-muted"}`}>
          {el.tone === "success" && <Check size={12} className="shrink-0 text-success" aria-hidden="true" />}
          {el.label}
        </p>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-1.5">
        <SaveBourse id={b.id} name={b.name} status={status} />
        <WhyPopover label={m.card.why} title={m.card.whyTitle} items={reasons} />
      </div>
    </li>
  );
}
