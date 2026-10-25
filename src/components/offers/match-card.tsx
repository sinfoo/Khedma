import { fmt, type Dict } from "@/lib/i18n/dict";
import type { MatchBreakdown, MatchLine } from "@/lib/match";

function lineText(l: MatchLine, t: Dict): { label: string; detail: string } {
  const m = t.offers2.match;
  if (l.kind === "skills")
    return { label: m.skillsLabel, detail: `${fmt(m.skills, { f: l.found.length, n: l.found.length + l.missing.length })}${l.missing.length ? ` ${fmt(m.missing, { list: l.missing.slice(0, 6).join(", ") })}` : ""}${l.optional.length ? ` ${fmt(m.optional, { list: l.optional.slice(0, 6).join(", ") })}` : ""}` };
  if (l.kind === "title") return { label: m.titleLabel, detail: fmt(l.ratio === 0 ? m.title0 : l.ratio < 1 ? m.titlePart : m.titleFull, { role: l.role }) };
  return { label: m.levelLabel, detail: `${m.level[l.level]} · ${l.ratio === 1 ? m.levelFit : l.ratio > 0 ? m.levelPart : m.levelMiss}` };
}

/** Rule-based match next to the AI score: every line says what was compared. */
export function MatchCard({ match, t }: { match: MatchBreakdown; t: Dict }) {
  const m = t.offers2.match;
  return (
    <section className="card p-5 rise" aria-labelledby="match-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="match-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)" }}>{m.title}</h2>
        {match.pct !== null && <span className="mono text-sm font-semibold">{match.pct}%</span>}
      </div>
      <p className="mt-0.5 text-[0.75rem] text-muted">{m.hint}</p>
      {match.lines.length > 0 && (
        <dl className="mt-3 space-y-3">
          {match.lines.map((l) => {
            const { label, detail } = lineText(l, t);
            return (
              <div key={l.kind}>
                <div className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm">
                  <dt className="text-ink-2">{label}</dt>
                  <dd className="bar m-0 !h-2"><span style={{ width: `${Math.round(l.ratio * 100)}%` }} /></dd>
                  <dd className="mono m-0 text-right text-xs">{Math.round(l.ratio * 100)}%</dd>
                </div>
                <dd className="m-0 mt-1 text-[0.78rem] text-muted">{detail}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {match.skipped.length > 0 && (
        <p className="mt-3 text-[0.75rem] text-muted">{fmt(m.skipped, { list: match.skipped.map((k) => m.skippedWhy[k]).join(" · ") })}</p>
      )}
    </section>
  );
}
