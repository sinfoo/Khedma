import type { AppState, Evaluation } from "@/lib/types";
import type { Dict } from "@/lib/i18n/dict";
import { fmt } from "@/lib/i18n/dict";

export function scoreColor(v: number) {
  if (v >= 4.5) return "var(--score-5)";
  if (v >= 4) return "var(--score-4)";
  if (v >= 3.5) return "var(--score-3)";
  if (v >= 2.5) return "var(--score-2)";
  return "var(--score-1)";
}

/** Circular score dial, 1–5. Accessible: role=img with a spoken label. */
export function ScoreRing({
  value,
  size = 56,
  label,
  animate = true,
}: {
  value: number;
  size?: number;
  label: string;
  animate?: boolean;
}) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, (value - 1) / 4));
  const dash = c * pct;
  return (
    <span
      role="img"
      aria-label={label}
      className="relative inline-grid place-items-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={scoreColor(value)}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={animate ? { ["--dash" as string]: c, animation: "draw 0.9s cubic-bezier(.2,.7,.2,1) both" } : undefined}
        />
      </svg>
      <span
        className="absolute mono font-semibold leading-none"
        style={{ fontSize: size * 0.3, color: "var(--ink)" }}
      >
        {value.toFixed(1)}
      </span>
    </span>
  );
}

export function VerdictChip({ verdict, t }: { verdict: Evaluation["verdict"]; t: Dict }) {
  const cls =
    verdict === "apply_now" ? "chip-accent" : verdict === "apply" ? "chip-success" : verdict === "maybe" ? "chip-saffron" : "chip-danger";
  return <span className={`chip ${cls}`}>{t.verdicts[verdict]}</span>;
}

const STATE_CLS: Record<AppState, string> = {
  evaluated: "",
  applied: "chip-accent",
  responded: "chip-accent",
  interview: "chip-saffron",
  offer: "chip-success",
  hired: "chip-success",
  rejected: "chip-danger",
  discarded: "",
};

export function StateChip({ state, t }: { state: AppState; t: Dict }) {
  return <span className={`chip ${STATE_CLS[state]}`}>{t.states[state]}</span>;
}

export function EngineChip({ engine, t }: { engine: string; t: Dict }) {
  const offline = engine === "heuristic";
  return (
    <span className={`chip ${offline ? "chip-saffron" : ""}`}>
      <span className="sr-only">{t.common.engine}: </span>
      <span aria-hidden="true" className="inline-block size-1.5 rounded-full" style={{ background: offline ? "var(--saffron)" : "var(--accent)" }} />
      {offline ? t.common.heuristic : engine.replace("ollama:", "Ollama · ").replace("claude:", "Claude · ")}
    </span>
  );
}

export function scoreLabel(t: Dict, v: number) {
  return fmt(t.a11y.scoreOutOf, { v: v.toFixed(1) });
}

export function Empty({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="card p-10 text-center rise">
      <p className="display text-2xl">{title}</p>
      {hint && <p className="text-muted mt-2 max-w-md mx-auto">{hint}</p>}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, lead, actions }: { title: string; lead?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8 rise">
      <div>
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {lead && <p className="text-muted mt-1 max-w-2xl">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function fmtDate(s: string | null | undefined, locale: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(locale === "fr" ? "fr-TN" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function daysUntil(s: string | null | undefined) {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}
