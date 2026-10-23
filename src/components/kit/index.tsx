// Server-safe presentational primitives. Client-only pieces live in sibling files
// (toast.tsx, dialog.tsx, menu.tsx). Import from "@/components/kit".
import Link from "next/link";

export function PageHeader({
  title,
  lead,
  eyebrow,
  actions,
  back,
  size = "md",
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  /** "lg" is the Today greeting (2.4rem); "md" every other page (2rem). */
  size?: "md" | "lg";
}) {
  return (
    <header className="mb-[18px]">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink no-print">
          <span aria-hidden="true">←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h1 className={`leading-[1.1] tracking-[-0.025em] ${size === "lg" ? "text-[2rem] sm:text-[2.4rem]" : "text-[1.75rem] sm:text-[2rem]"}`}>{title}</h1>
          {lead && <p className="mt-1.5 max-w-2xl text-muted">{lead}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({
  title,
  actions,
  children,
  className = "",
  id,
  i = 0,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  i?: number;
}) {
  const hid = id ? `${id}-h` : undefined;
  return (
    <section className={`card p-[18px] rise ${className}`} style={{ ["--i" as string]: i }} aria-labelledby={hid}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 id={hid} className="card-title">{title}</h2>}
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, trend, i = 0 }: { label: string; value: React.ReactNode; hint?: React.ReactNode; trend?: number[]; i?: number }) {
  return (
    <div className="card p-4 rise" style={{ ["--i" as string]: i }}>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 flex items-end justify-between gap-2">
        <span className="display text-3xl tabular leading-none">{value}</span>
        {trend && trend.length > 1 && <Sparkline values={trend} />}
      </dd>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Tiny inline trend line. Decorative: the number next to it carries the meaning. */
export function Sparkline({ values, width = 72, height = 24 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Progress({ value, max = 100, label, tone = "accent" }: { value: number; max?: number; label: string; tone?: "accent" | "success" | "saffron" | "danger" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: `var(--${tone})` }} />
    </div>
  );
}

const HUES = [210, 28, 160, 340, 265, 190, 45, 120];
/** Company monogram with a stable color from the name. */
export function CompanyAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const clean = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim();
  const initials = (clean.split(/\s+/).slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-[10px] font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `hsl(${hue} 70% 50% / 0.14)`,
        // Lightness per theme (--avatar-l): 42% failed 4.5:1 on teal/cyan tints in light mode.
        color: `hsl(${hue} 60% var(--avatar-l))`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 60% 50% / 0.25)`,
      }}
    >
      <span style={{ filter: "var(--avatar-filter, none)" }}>{initials}</span>
    </span>
  );
}

export function EmptyState({ icon, title, hint, children }: { icon?: React.ReactNode; title: string; hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="grid min-h-[50vh] place-items-center rise">
      <div className="max-w-[560px] text-center">
        {icon && (
          <div aria-hidden="true" className="relative mx-auto mb-6 grid size-[120px] place-items-center">
            <span className="absolute inset-0 rounded-full border border-dashed border-line-strong" />
            <span className="absolute inset-[22px] rounded-full border border-dashed border-line" />
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: "conic-gradient(from 0deg, color-mix(in oklab, var(--accent) 35%, transparent), transparent 80deg)",
                maskImage: "radial-gradient(circle, black 0 95%, transparent 96%)",
                animation: "sweep 3s linear infinite",
              }}
            />
            <span className="relative text-accent-text [&>svg]:size-9">{icon}</span>
          </div>
        )}
        <p className="display text-[1.75rem] leading-tight tracking-[-0.02em]">{title}</p>
        {hint && <p className="mx-auto mt-2.5 max-w-md text-base leading-[1.55] text-muted">{hint}</p>}
        {children && <div className="mt-[22px] flex flex-wrap justify-center gap-2.5">{children}</div>}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Link-based tabs (server-friendly, deep-linkable). */
export function LinkTabs({ label, tabs, current }: { label: string; tabs: { key: string; href: string; label: string; count?: number }[]; current: string }) {
  return (
    <nav aria-label={label} className="mb-6 no-print">
      <ul className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={current === t.key ? "page" : undefined}
              className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                current === t.key ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
              {t.count !== undefined && <span className="chip !px-1.5 !py-0 text-[0.7rem]">{t.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
