// Server-safe chart primitives: inline SVG marks + HTML labels, each with a data table fallback.

type Cell = string | number;

export function ChartCard({
  id,
  title,
  desc,
  summary,
  head,
  rows,
  showData,
  children,
  i = 0,
  className = "",
}: {
  id: string;
  title: string;
  desc?: string;
  summary: string;
  head: string[];
  rows: Cell[][];
  showData: string;
  children: React.ReactNode;
  i?: number;
  className?: string;
}) {
  return (
    <figure className={`card flex flex-col p-[18px] rise ${className}`} style={{ ["--i" as string]: i }} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="card-title text-[0.9rem]">{title}</h2>
      {desc && <p className="mt-0.5 text-[0.75rem] text-muted">{desc}</p>}
      <div role="img" aria-label={summary} className="mt-3 flex-1">
        <div aria-hidden="true">{children}</div>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">{showData}</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="table w-full text-sm">
            <thead>
              <tr>{head.map((h) => <th key={h} scope="col" className="text-left">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k}>
                  {r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="text-left font-normal">{c}</th> : <td key={j} className="tabular">{c}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Vertical bars. Labels are HTML so they stay readable at any width; `every` thins them on small screens. */
export function Bars({ values, labels, height = 140, tone = "var(--accent)", highlightLast = false }: { values: number[]; labels: string[]; height?: number; tone?: string; highlightLast?: boolean }) {
  const max = Math.max(1, ...values);
  const n = values.length;
  const gap = 0.22;
  return (
    <div>
      <div className="relative" style={{ height }}>
        {/* gridlines */}
        <div className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2].map((g) => <div key={g} className="border-t border-dashed border-line" />)}
        </div>
        <svg viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          {values.map((v, i) => {
            const h = (v / max) * 100;
            return (
              <rect
                key={i}
                x={i + gap / 2}
                y={100 - h}
                width={1 - gap}
                height={h}
                rx={0.08}
                fill={tone}
                opacity={highlightLast && i < n - 1 ? 0.55 : 0.9}
              />
            );
          })}
        </svg>
      </div>
      <div className="mt-1.5 grid text-center text-[0.68rem] text-muted tabular" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {labels.map((l, i) => (
          <span key={i} className={`truncate ${i % 2 && n > 8 ? "hidden sm:block" : ""}`}>
            {l}
            <span className="block text-ink-2">{values[i] || ""}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars with a label column and a value column. */
export function HBars({ rows, max, labelWidth = "8.5rem" }: { rows: { label: React.ReactNode; value: number; display: React.ReactNode; tone?: string; note?: React.ReactNode }[]; max?: number; labelWidth?: string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={i} className="grid items-center gap-3 text-sm" style={{ gridTemplateColumns: `${labelWidth} minmax(0,1fr) auto` }}>
          <span className="truncate text-ink-2">{r.label}</span>
          <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-5 w-full">
            <rect x="0" y="0" width="100" height="10" rx="1.5" fill="var(--surface-2)" />
            <rect x="0" y="0" width={Math.max(r.value ? 1.5 : 0, (r.value / m) * 100)} height="10" rx="1.5" fill={r.tone ?? "var(--accent)"} />
          </svg>
          <span className="mono min-w-[3ch] text-right text-xs tabular">
            {r.display}
            {r.note && <span className="ml-1.5 text-muted">{r.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
