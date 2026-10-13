// Server-safe coach building blocks (no hooks): section tabs and score visuals.
import { LinkTabs, Progress } from "@/components/kit";
import { scoreColor } from "@/components/ui";
import type { Dict } from "@/lib/i18n/dict";
import { DIMS, type Scores } from "@/lib/coach/logic";

export function CoachTabs({ t, current }: { t: Dict; current: "practice" | "stories" | "drill" }) {
  const c = t.coach2.tabs;
  return (
    <LinkTabs
      label={c.label}
      current={current}
      tabs={[
        { key: "practice", href: "/app/coach", label: c.practice },
        { key: "stories", href: "/app/coach/stories", label: c.stories },
        { key: "drill", href: "/app/coach/drill", label: c.drill },
      ]}
    />
  );
}

/** Compact per-dimension bars (1–5) used under each answer. */
export function DimBars({ scores, t }: { scores: Scores; t: Dict }) {
  return (
    <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
      {DIMS.map((d) => (
        <div key={d} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
          <dt className="text-xs font-medium text-ink-2">{t.coach2.dims[d]}</dt>
          <dd className="mono text-xs font-semibold" style={{ color: scoreColor(scores[d]) }}>
            {scores[d].toFixed(1)}
          </dd>
          <dd className="col-span-2">
            <Progress value={scores[d]} max={5} label={`${t.coach2.dims[d]} ${scores[d].toFixed(1)}/5`} tone={scores[d] >= 4 ? "success" : scores[d] >= 3 ? "accent" : scores[d] >= 2 ? "saffron" : "danger"} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Four-axis radar (decorative) next to a real table that carries the numbers. */
export function DimRadar({ scores, t }: { scores: Scores; t: Dict }) {
  const R = 68;
  const CX = 150;
  const CY = 105;
  // structure top, relevance right, specificity bottom, communication left
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    return [CX + Math.cos(a) * R * (v / 5), CY + Math.sin(a) * R * (v / 5)] as const;
  };
  const poly = DIMS.map((d, i) => pt(i, scores[d]).join(",")).join(" ");
  return (
    <div className="grid items-center gap-5 md:grid-cols-[260px_1fr]">
      <svg viewBox="0 0 300 210" className="mx-auto w-[260px] max-w-full" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((r) => (
          <polygon key={r} points={DIMS.map((_, i) => pt(i, r).join(",")).join(" ")} fill="none" stroke="var(--line)" strokeWidth={r === 5 ? 1.25 : 0.75} />
        ))}
        {DIMS.map((_, i) => {
          const [x, y] = pt(i, 5);
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--line)" strokeWidth="0.75" />;
        })}
        <polygon points={poly} fill="var(--accent)" fillOpacity="0.18" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {DIMS.map((d, i) => {
          const [x, y] = pt(i, scores[d]);
          return <circle key={d} cx={x} cy={y} r="3.5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />;
        })}
        {DIMS.map((d, i) => {
          const [x, y] = pt(i, 5.45);
          return (
            <text key={d} x={x} y={i === 0 ? y : i === 2 ? y + 9 : y + 3.5} textAnchor={i === 1 ? "start" : i === 3 ? "end" : "middle"} fontSize="10" fontWeight="600" fill="var(--muted)">
              {t.coach2.dims[d]}
            </text>
          );
        })}
      </svg>
      <table className="table">
        <caption className="sr-only">{t.coach2.report.chartCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.coach2.report.dimension}</th>
            <th scope="col" className="!text-right">{t.coach2.report.average}</th>
          </tr>
        </thead>
        <tbody>
          {DIMS.map((d) => (
            <tr key={d}>
              <th scope="row" className="!static !border-b !border-line !bg-transparent !text-sm !font-medium !text-ink">
                {t.coach2.dims[d]}
                <span className="block text-xs font-normal text-muted">{t.coach2.dimHints[d]}</span>
              </th>
              <td className="mono text-right font-semibold" style={{ color: scoreColor(scores[d]) }}>
                {scores[d].toFixed(1)}
                <span className="text-muted font-normal">/5</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
