import { ArrowUpRight, Award, Clock, Globe2 } from "lucide-react";
import { CompanyAvatar } from "@/components/kit";
import { CoverImage } from "./cover-image";
import { fieldStyle, hueVar } from "./field-style";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { SOURCE_NAMES } from "@/lib/learn/directory";
import type { Course } from "@/lib/learn/model";
import type { Reason } from "@/lib/learn/recommend";

const PRICE_TONE: Record<Course["price"], string> = { free: "chip-success", coupon: "chip-success", freemium: "chip-accent", paid: "" };

export function duration(t: Dict, min: number | null): string | null {
  if (!min) return null;
  return min < 90 ? fmt(t.learn2.minutes, { n: min }) : fmt(t.learn2.hours, { n: Math.round(min / 60) });
}

/** One course: title, who teaches it, honest price and certificate, length, language, and why it was picked. */
export function CourseCard({ c, t, reasons, why }: { c: Course; t: Dict; reasons?: Reason[]; why?: string }) {
  const m = t.learn2;
  const d = duration(t, c.duration_min);
  const r = reasons?.slice(0, 3).map((x) =>
    x.kind === "gap" ? fmt(m.reasons.gap, { skill: x.skill, n: x.n }) : x.kind === "role" ? fmt(m.reasons.role, { role: x.role }) : x.kind === "lang" ? fmt(m.reasons.lang, { lang: x.lang.toUpperCase() }) : m.reasons[x.kind],
  );
  const { Icon, hue } = fieldStyle(c.fields);
  // Scraped data: only https pictures; square badge art (Microsoft's SVGs) is shown whole instead of cropped.
  const image = c.image?.startsWith("https://") ? c.image : null;
  return (
    <li className="card flex min-w-0 flex-col overflow-hidden" style={hueVar(hue)}>
      {/* The cover: the field's colour and icon, under the course's own picture when it has one. */}
      <div className="lc-cover relative h-[118px] shrink-0" aria-hidden="true">
        {/* The big field icon only when the course brings no picture of its own (it cluttered badge art). */}
        {!image && <Icon className="lc-cover-icon absolute -bottom-5 -right-3" size={112} strokeWidth={1.25} />}
        {image && <CoverImage src={image} contain={/\.svg(\?|$)/i.test(image)} />}
        {c.fields[0] && (
          <span className="lc-field absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold">
            <Icon size={12} /> {m.fields[c.fields[0]]}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
      <p className="flex min-w-0 items-center gap-2 text-[0.75rem] text-muted">
        <CompanyAvatar name={c.provider} size={22} />
        <span className="truncate">
          {c.provider}
          {SOURCE_NAMES[c.source] && SOURCE_NAMES[c.source] !== c.provider ? ` · ${fmt(m.via, { source: SOURCE_NAMES[c.source] })}` : ""}
        </span>
      </p>
      <a href={c.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-ink hover:text-accent-text">
        {c.title}
        <ArrowUpRight size={13} className="ml-1 inline align-baseline" aria-label={m.open} />
      </a>
      {why ? <p className="text-[0.8rem] leading-relaxed text-ink-2">{why}</p> : r?.length ? <p className="text-[0.78rem] leading-relaxed text-ink-2">{r.join(" · ")}</p> : null}
      {!why && !r?.length && c.description && <p className="line-clamp-2 text-[0.78rem] leading-relaxed text-muted">{c.description}</p>}
      {c.price === "coupon" && c.updated_at && <p className="text-[0.72rem] text-muted">{fmt(m.couponChecked, { date: c.updated_at })}</p>}
      <ul className="mt-auto flex flex-wrap gap-1.5 text-[0.7rem]">
        <li className={`chip !py-px ${PRICE_TONE[c.price]}`}>{m.price[c.price]}</li>
        {c.cert !== "none" && (
          <li className="chip !py-px">
            <Award size={11} aria-hidden="true" /> {m.cert[c.cert]}
          </li>
        )}
        {d && (
          <li className="chip !py-px">
            <Clock size={11} aria-hidden="true" /> {d}
          </li>
        )}
        {c.level && <li className="chip !py-px">{m.level[c.level]}</li>}
        {c.languages.length > 0 && (
          <li className="chip !py-px">
            <Globe2 size={11} aria-hidden="true" /> {c.languages.slice(0, 3).join(" · ").toUpperCase()}
          </li>
        )}
      </ul>
      </div>
    </li>
  );
}
