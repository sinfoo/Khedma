"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { Logo } from "@/components/logo";
import type { ShellData } from "@/lib/shell";
import { FOOTER_ITEMS, NAV_GROUPS, isActive } from "./nav-items";

const RAIL_KEY = "khedma:rail";

const BADGE_TONE = {
  accent: { bg: "var(--accent-soft)", fg: "var(--accent-text)" },
  saffron: { bg: "var(--saffron-soft)", fg: "var(--saffron)" },
  danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  muted: { bg: "var(--surface-2)", fg: "var(--muted)" },
} as const;

/** Grouped navigation list, shared by the desktop sidebar and the mobile drawer. */
export function NavList({ onNavigate, badges, rail = false }: { onNavigate?: () => void; badges?: ShellData["badges"]; rail?: boolean }) {
  const path = usePathname();
  const { t } = useT();
  return (
    <div className="flex flex-col gap-3.5">
      {NAV_GROUPS.map((g) => (
        <div key={g.key}>
          <p className="rail-hide px-2.5 pb-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted">{t.shell2.groups[g.key]}</p>
          {rail && <span aria-hidden="true" className="mx-2.5 mb-2 mt-1 block h-px bg-line" />}
          <ul className="flex flex-col gap-px">
            {g.items.map((item) => {
              const active = isActive(path, item);
              const b = item.badge ? badges?.[item.badge] : undefined;
              const tone = b ? BADGE_TONE[b.tone] : null;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={t.shell2.nav[item.key]}
                    className={`group relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm transition-colors ${
                      active ? "bg-accent-soft font-semibold text-ink" : "font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    {active && <span aria-hidden="true" className="absolute -left-2.5 top-2 bottom-2 w-[3px] rounded-r-[3px] bg-accent" />}
                    <item.Icon size={17} aria-hidden="true" className={`shrink-0 ${active ? "text-accent-text" : "text-muted group-hover:text-ink"}`} />
                    <span className="rail-hide flex-1 whitespace-nowrap">{t.shell2.nav[item.key]}</span>
                    {b && b.n > 0 && tone && (
                      <>
                        <span
                          className="rail-hide inline-flex h-5 items-center whitespace-nowrap rounded-full px-[7px] font-mono text-[0.68rem] font-bold"
                          style={{ background: tone.bg, color: tone.fg }}
                        >
                          {b.n}
                        </span>
                        {rail && (
                          <span aria-hidden="true" className="absolute right-2 top-2 size-[7px] rounded-full ring-2 ring-bg-elev" style={{ background: tone.fg }} />
                        )}
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

const subscribeRail = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-rail"] });
  return () => mo.disconnect();
};
const readRail = () => document.documentElement.hasAttribute("data-rail");

/** Collapsed-rail preference lives on <html data-rail>; the inline script in the layout applies it before paint. */
function useRail() {
  const rail = useSyncExternalStore(subscribeRail, readRail, () => false);
  const toggle = () => {
    const next = !rail;
    document.documentElement.toggleAttribute("data-rail", next);
    try {
      localStorage.setItem(RAIL_KEY, next ? "1" : "0");
    } catch {
      /* storage blocked: the attribute still applies for this tab */
    }
  };
  return [rail, toggle] as const;
}

export function Sidebar({ data }: { data: ShellData }) {
  const { t } = useT();
  const path = usePathname();
  const [rail, toggleRail] = useRail();
  const s = t.shell2;
  const goalPct = Math.min(1, data.goal.target ? data.goal.done / data.goal.target : 0);
  const c = 2 * Math.PI * 14;
  const railLabel = rail ? s.expand : s.collapse;
  const weekLine = data.week.due || data.goal.done
    ? fmt(s.weekLine, { apps: data.goal.done, due: data.week.due })
    : fmt(s.weekLineEmpty, { n: data.goal.target });

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-bg-elev lg:flex no-print">
      <div className={`flex items-center gap-2.5 px-3.5 pb-3 pt-4 ${rail ? "flex-col" : ""}`}>
        <Link href="/app" className={`flex min-w-0 items-center gap-2.5 rounded-md text-ink ${rail ? "" : "flex-1"}`} aria-label={s.brandLabel}>
          <Logo size={30} className="shrink-0" />
          <span className="rail-hide min-w-0">
            <span className="display block text-[1.15rem] leading-none">Khedma</span>
            <span className="mt-[3px] block whitespace-nowrap text-[0.68rem] text-muted">{s.tagline}</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={toggleRail}
          aria-label={railLabel}
          title={railLabel}
          className={`grid h-7 shrink-0 place-items-center rounded-lg border text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink ${
            rail ? "w-full border-line bg-surface" : "w-7 border-transparent bg-transparent"
          }`}
        >
          {rail ? <PanelLeftOpen size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
        </button>
      </div>

      {/* This week, at a glance */}
      <Link
        href="/app"
        className="rail-hide mx-3 mb-2.5 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-ink transition-colors hover:border-line-strong"
      >
        <span role="img" aria-label={fmt(s.weekGoal, { done: data.goal.done, n: data.goal.target })} className="relative grid size-[34px] shrink-0 place-items-center">
          <svg viewBox="0 0 34 34" width="34" height="34" className="-rotate-90" aria-hidden="true">
            <circle cx="17" cy="17" r="14" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
            <circle
              cx="17"
              cy="17"
              r="14"
              fill="none"
              stroke={goalPct >= 1 ? "var(--success)" : "var(--accent)"}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${c * goalPct} ${c}`}
              style={{ transition: "stroke-dasharray 1s cubic-bezier(.2,.7,.2,1)" }}
            />
          </svg>
          <span className="absolute font-mono text-[0.62rem] font-bold">
            {data.goal.done}/{data.goal.target}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block whitespace-nowrap text-[0.8rem] font-semibold">{s.thisWeek}</span>
          <span className="block truncate text-[0.7rem] text-muted">{weekLine}</span>
        </span>
      </Link>

      <nav aria-label={t.a11y.navMain} className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-2.5">
        <NavList badges={data.badges} rail={rail} />
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-line px-2.5 pb-3 pt-2.5">
        <Link
          href="/app/profile"
          title={s.nav.profile}
          aria-current={isActive(path, FOOTER_ITEMS[0]) ? "page" : undefined}
          className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-ink transition-colors hover:bg-surface-2 ${isActive(path, FOOTER_ITEMS[0]) ? "bg-accent-soft" : ""}`}
        >
          <span aria-hidden="true" className="display relative grid size-8 shrink-0 place-items-center rounded-[10px] bg-accent text-[0.8rem] text-accent-ink">
            {data.initials}
            <span
              title={data.engine.online ? fmt(s.engineOnline, { label: data.engine.label }) : s.engineOffline}
              className="absolute -bottom-[3px] -right-[3px] size-2.5 rounded-full ring-2 ring-bg-elev"
              style={{ background: data.engine.online ? "var(--success)" : "var(--saffron)" }}
            />
          </span>
          <span className="rail-hide min-w-0 flex-1">
            <span className="block truncate text-[0.85rem] font-semibold leading-tight">{s.nav.profile}</span>
            <span className="block truncate text-[0.7rem] text-muted">
              {data.name ? `${data.name} · ` : ""}
              {fmt(s.profileStrength, { pct: data.strength })} · {data.engine.short}
            </span>
          </span>
        </Link>
        <Link
          href="/app/settings"
          title={s.nav.settings}
          aria-current={isActive(path, FOOTER_ITEMS[1]) ? "page" : undefined}
          className={`group flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm transition-colors hover:bg-surface-2 hover:text-ink ${
            isActive(path, FOOTER_ITEMS[1]) ? "bg-accent-soft font-semibold text-ink" : "font-medium text-ink-2"
          }`}
        >
          <Settings size={17} aria-hidden="true" className={`shrink-0 ${isActive(path, FOOTER_ITEMS[1]) ? "text-accent-text" : "text-muted group-hover:text-ink"}`} />
          <span className="rail-hide flex-1 whitespace-nowrap">{s.nav.settings}</span>
          <span className="rail-hide whitespace-nowrap text-[0.68rem] text-muted">{s.settingsHint}</span>
        </Link>
      </div>
    </aside>
  );
}
