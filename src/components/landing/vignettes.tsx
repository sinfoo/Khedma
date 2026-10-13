// Small product vignettes for the feature showcase. Decorative: each is aria-hidden,
// the row's heading and text carry the meaning.
import { Bell, CalendarDays, Check, Mic, ShieldCheck } from "lucide-react";
import type { Dict } from "@/lib/i18n/dict";
import { CompanyAvatar } from "@/components/kit";
import { scoreColor } from "@/components/ui";
import s from "./styles";

type V = Dict["landing2"]["features"]["v"];
const fr = (locale: string) => (locale === "fr" ? "fr-FR" : "en-US");

export function ScoreVignette({ v, locale, engine, verdict }: { v: V; locale: string; engine: string; verdict: string }) {
  const values = [4.7, 4.8, 4.3, 3.9, 4.9];
  return (
    <div aria-hidden="true" className="card mx-auto w-full max-w-sm p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{v.global}</p>
          <p className="display text-5xl leading-none" style={{ color: scoreColor(4.6) }}>
            {(4.6).toLocaleString(fr(locale))}
            <span className="text-xl text-muted"> / 5</span>
          </p>
        </div>
        <span className="chip chip-accent">{verdict}</span>
      </div>
      <ul className="mt-5 space-y-2.5">
        {v.dims.map((d, i) => (
          <li key={d} className="grid grid-cols-[1fr_auto_2rem] items-center gap-3 text-sm">
            <span className="truncate text-ink-2">{d}</span>
            <span className="flex gap-1">
              {[1, 2, 3, 4, 5].map((p) => (
                <span
                  key={p}
                  className="h-2.5 w-4 rounded-[3px]"
                  style={{ background: p <= Math.round(values[i]) ? scoreColor(values[i]) : "var(--surface-3)" }}
                />
              ))}
            </span>
            <span className="mono text-right text-xs text-muted">{values[i].toLocaleString(fr(locale))}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-1.5 border-t border-line pt-4">
        <span className="chip chip-accent">
          <span className="size-1.5 rounded-full bg-current" /> {engine}
        </span>
        <span className="chip text-muted">{v.heuristic}</span>
      </div>
    </div>
  );
}

export function AtsVignette({ v }: { v: V }) {
  const missing = new Set([3, 5]);
  const pct = ((v.atsWords.length - missing.size) / v.atsWords.length) * 100;
  return (
    <div aria-hidden="true" className="card mx-auto w-full max-w-sm p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{v.atsTitle}</p>
      <p className="mt-3 flex flex-wrap gap-1.5 font-mono text-[0.82rem]">
        {v.atsWords.map((w, i) => (
          <span key={w} className={`rounded px-1.5 py-0.5 ${missing.has(i) ? s.missing : s.found}`}>
            {w}
          </span>
        ))}
      </p>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="mono text-ink-2">{v.atsScore}</span>
        <span className="flex gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${s.found}`} /> {v.atsFound}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${s.missing}`} /> {v.atsMiss}
          </span>
        </span>
      </div>
    </div>
  );
}

export function TailorVignette({ v }: { v: V }) {
  return (
    <div aria-hidden="true" className="relative mx-auto h-64 w-full max-w-sm">
      {/* letter, behind */}
      <div className="card absolute right-0 top-0 w-[78%] rotate-[3deg] p-4 shadow-card">
        <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted">{v.letterTitle}</p>
        <p className="mt-2 font-serif text-sm text-ink">{v.letterOpen}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-2">{v.letterLine}</p>
        <div className="mt-2 space-y-1.5">
          <span className="block h-1.5 w-full rounded bg-surface-3" />
          <span className="block h-1.5 w-4/5 rounded bg-surface-3" />
        </div>
      </div>
      {/* CV, front */}
      <div className="card absolute bottom-0 left-0 w-[86%] -rotate-[2deg] p-4 shadow-pop">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted">{v.cvTitle}</p>
          <span className="chip chip-success">
            <ShieldCheck size={12} /> {v.honest}
          </span>
        </div>
        <div className="mt-3 space-y-1.5">
          <span className="block h-1.5 w-2/5 rounded bg-ink-2/60" />
          <span className="block h-1.5 w-full rounded bg-surface-3" />
        </div>
        <p className="mt-2.5 rounded-md bg-accent-soft px-2 py-1.5 text-xs leading-snug text-accent-text">
          {v.cvLine} <span className="ml-1 font-semibold opacity-80">· {v.cvTag}</span>
        </p>
        <div className="mt-2.5 space-y-1.5">
          <span className="block h-1.5 w-11/12 rounded bg-surface-3" />
          <span className="block h-1.5 w-3/5 rounded bg-surface-3" />
        </div>
      </div>
    </div>
  );
}

export function CoachVignette({ v }: { v: V }) {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-sm space-y-3">
      <div className="card max-w-[85%] rounded-bl-md p-3.5 text-sm text-ink">{v.coachQ}</div>
      <div className="ml-auto flex w-fit items-center gap-3 rounded-2xl rounded-br-md bg-accent px-4 py-3 text-accent-ink">
        <Mic size={16} />
        <span className={`${s.wave} flex h-6 items-center gap-[3px]`}>
          {[0.5, 0.9, 0.6, 1, 0.7, 0.4, 0.8, 0.55, 0.95, 0.5, 0.75, 0.45].map((h, i) => (
            <span key={i} className="w-[3px] rounded-full bg-current" style={{ height: `${h * 100}%`, ["--i" as string]: i }} />
          ))}
        </span>
        <span className="text-xs font-semibold">{v.listening}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {v.star.map((x, i) => (
          <span key={x} className={`chip ${i < 2 ? "chip-success" : "chip-saffron"}`}>
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TrackVignette({ v }: { v: V }) {
  const cols = [
    { name: v.cols[0], cards: [v.cards[0], v.cards[2]], tone: "" },
    { name: v.cols[1], cards: [v.cards[1]], tone: "border-l-saffron" },
    { name: v.cols[2], cards: [v.cards[3]], tone: "border-l-success" },
  ];
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-md">
      <div className="grid grid-cols-3 gap-2">
        {cols.map((c) => (
          <div key={c.name} className="min-w-0 rounded-xl bg-surface-3/60 p-2">
            <p className="flex items-center justify-between px-1 text-[0.7rem] font-semibold text-muted">
              <span className="truncate">{c.name}</span>
              <span className="mono">{c.cards.length}</span>
            </p>
            <div className="mt-2 space-y-1.5">
              {c.cards.map((name) => (
                <div key={name} className={`card flex items-center gap-1.5 border-l-[3px] p-1.5 ${c.tone || "border-l-accent"}`}>
                  <CompanyAvatar name={name} size={20} />
                  <span className="truncate text-[0.72rem] font-semibold">{name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        <p className="card flex items-center gap-2.5 p-2.5 text-xs">
          <CalendarDays size={15} className="shrink-0 text-accent-text" />
          <span className="truncate">{v.event}</span>
        </p>
        <p className="flex items-center gap-2.5 rounded-xl bg-saffron-soft p-2.5 text-xs font-semibold text-saffron">
          <Bell size={15} className="shrink-0" />
          <span className="truncate">{v.remind}</span>
        </p>
      </div>
    </div>
  );
}

export function InsightsVignette({ v }: { v: V }) {
  const rates = [8, 12, 15, 21, 27, 34];
  return (
    <div aria-hidden="true">
      <p className="flex items-baseline justify-between text-xs text-muted">
        {v.rate} <span className="display text-2xl text-ink">34 %</span>
      </p>
      <div className="mt-3 flex h-20 items-end gap-1.5">
        {rates.map((r, i) => (
          <span
            key={i}
            className={`flex-1 rounded-t-md ${i === rates.length - 1 ? "bg-saffron" : "bg-accent/70"}`}
            style={{ height: `${(r / 34) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {v.weeks.map((w) => (
          <span key={w} className="mono flex-1 text-center text-[0.65rem] text-muted">
            {w}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SalaryVignette({ v }: { v: V }) {
  return (
    <div aria-hidden="true">
      <ul className="space-y-2">
        {v.salaries.map((x) => (
          <li key={x.r} className="flex items-center justify-between gap-3 border-b border-dashed border-line pb-2 text-xs">
            <span className="text-ink-2">{x.r}</span>
            <span className="mono text-right font-semibold text-ink">{x.v}</span>
          </li>
        ))}
      </ul>
      <span className="chip chip-saffron mt-3">{v.indicative}</span>
    </div>
  );
}

export function BoardsVignette({ v }: { v: V }) {
  return (
    <ul aria-hidden="true" className="flex flex-wrap gap-1.5">
      {v.boards.map((b, i) => (
        <li key={b} className={`chip ${i < 2 ? "chip-accent" : ""}`}>
          {i < 2 ? <Check size={12} /> : <span className="size-1.5 rounded-full bg-current opacity-60" />}
          {b}
        </li>
      ))}
    </ul>
  );
}
