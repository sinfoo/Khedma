"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, useSyncExternalStore, useTransition } from "react";
import { Bell, Menu as MenuIcon, Search, CalendarClock, AlarmClock, Flag, Radar, ChevronRight, Moon, Sun, Monitor } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Dialog } from "@/components/kit/dialog";
import { Wordmark } from "@/components/logo";
import type { Notice } from "@/lib/notices";
import type { ShellData } from "@/lib/shell";
import { setLocale, setTheme } from "@/app/actions/prefs";
import { CommandPalette } from "./command-palette";
import { NavList } from "./sidebar";
import { NavProgress } from "./nav-progress";
import { NAV_ITEMS, isActive } from "./nav-items";

const subscribeTitle = (cb: () => void) => {
  const el = document.querySelector("title");
  if (!el) return () => {};
  const mo = new MutationObserver(cb);
  mo.observe(el, { childList: true, characterData: true, subtree: true });
  return () => mo.disconnect();
};
const readTitle = () => document.title.replace(/\s*·\s*Khedma\s*$/, "").trim();

/** Second crumb: the page's own title for detail routes, read from <title>. */
function useCrumbs() {
  const path = usePathname();
  const { t } = useT();
  const item = NAV_ITEMS.filter((i) => isActive(path, i)).sort((a, b) => b.href.length - a.href.length)[0];
  const crumb = item ? t.shell2.nav[item.key] : "Khedma";
  const deep = !!item && path !== item.href;
  const title = useSyncExternalStore(subscribeTitle, readTitle, () => "");
  return { crumb, crumb2: deep && title !== crumb ? title : "" };
}

export function Topbar({ theme, notices, data }: { theme: "light" | "dark" | "system"; notices: Notice[]; data: ShellData }) {
  const { t, locale } = useT();
  const s = t.shell2;
  const path = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [, start] = useTransition();
  const openHelp = useCallback(() => setHelp(true), []);
  const { crumb, crumb2 } = useCrumbs();
  const urgent = notices.filter((n) => n.overdue || n.kind === "interview").length;
  const onSources = path.startsWith("/app/sources");
  const fmt = (x: string) =>
    new Date(x.length <= 10 ? x + "T00:00" : x).toLocaleString(locale === "fr" ? "fr-TN" : "en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(x.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  const order = ["system", "light", "dark"] as const;
  const nextTheme = order[(order.indexOf(theme) + 1) % order.length];
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const nextLocale = locale === "fr" ? "en" : "fr";
  const iconBtn = "inline-flex size-9 items-center justify-center rounded-[10px] text-ink transition-colors hover:bg-surface-2";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 min-w-0 items-center gap-2 overflow-x-clip border-b border-line bg-bg/85 px-3 backdrop-blur-md sm:px-6 no-print">
        <NavProgress />
        <button type="button" className={`${iconBtn} shrink-0 lg:hidden`} aria-label={s.openMenu} aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
          <MenuIcon size={18} aria-hidden="true" />
        </button>
        <Link href="/app" className="shrink-0 rounded-md lg:hidden" aria-label="Khedma">
          <Wordmark size={26} className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </Link>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[0.85rem] text-muted lg:flex">
          <span className="font-semibold text-ink">{crumb}</span>
          {crumb2 && (
            <>
              <ChevronRight size={14} aria-hidden="true" />
              <span className="truncate">{crumb2}</span>
            </>
          )}
        </nav>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("khedma:palette"))}
          className="mx-auto flex h-9 w-full max-w-[420px] min-w-[2.25rem] items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 text-[0.85rem] text-muted transition-colors hover:border-line-strong"
          aria-label={s.search}
        >
          <Search size={15} aria-hidden="true" />
          <span className="hidden flex-1 truncate text-left md:inline">{s.search}</span>
          <kbd className="kbd ml-auto hidden xl:inline-block">Ctrl K</kbd>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <div className="relative">
            <button
              type="button"
              className={`${iconBtn} relative`}
              popoverTarget="notices"
              aria-label={`${s.notifications}${notices.length ? ` (${notices.length})` : ""}`}
              style={{ anchorName: "--notices" } as React.CSSProperties}
            >
              <Bell size={18} aria-hidden="true" />
              {notices.length > 0 && (
                <span aria-hidden="true" className={`absolute right-[7px] top-[7px] size-2 rounded-full ring-2 ring-bg ${urgent ? "bg-danger" : "bg-accent"}`} />
              )}
            </button>
            <div
              id="notices"
              popover="auto"
              className="menu w-[min(360px,calc(100vw-2rem))] !p-0 overflow-hidden !rounded-[14px]"
              style={{ positionAnchor: "--notices", top: "anchor(bottom)", right: "anchor(right)", marginTop: 8 } as React.CSSProperties}
            >
              <div className="flex items-center justify-between border-b border-line px-3.5 py-3">
                <p className="text-sm font-semibold">{s.needsYou}</p>
                <Link href="/app/calendar" className="text-[0.78rem] font-semibold" onClick={(e) => (e.currentTarget.closest("[popover]") as HTMLElement)?.hidePopover()}>
                  {s.seeCalendar}
                </Link>
              </div>
              {notices.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">{s.noNotifications}</p>
              ) : (
                <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto p-1.5">
                  {notices.map((n) => {
                    const Icon = n.kind === "interview" ? CalendarClock : n.kind === "deadline" ? Flag : AlarmClock;
                    const tone = n.overdue ? "tone-danger" : n.kind === "interview" ? "tone-saffron" : n.kind === "deadline" ? "tone-danger" : "tone-accent";
                    return (
                      <li key={n.key}>
                        <Link
                          href={n.href}
                          className="flex items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-ink-2 hover:bg-surface-2"
                          onClick={(e) => (e.currentTarget.closest("[popover]") as HTMLElement)?.hidePopover()}
                        >
                          <span className={`tile tile-xs ${tone}`}>
                            <Icon size={14} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">{n.title}</span>
                            <span className="block text-xs text-muted">
                              {n.overdue ? `${s.overdue} · ` : n.kind === "interview" ? `${s.interviewSoon} · ` : `${s.due} · `}
                              {fmt(n.at)}
                              {n.sub ? ` · ${n.sub}` : ""}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <button type="button" className={`${iconBtn} hidden sm:inline-flex`} aria-label={`${t.a11y.themeToggle}: ${t.common[nextTheme]}`} title={t.common[theme]} onClick={() => start(() => setTheme(nextTheme))}>
            <ThemeIcon size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${iconBtn} hidden text-[0.78rem] font-bold text-ink-2 sm:inline-flex`}
            aria-label={s.actions.toggleLang}
            title={s.actions.toggleLang}
            onClick={() => start(() => setLocale(nextLocale))}
          >
            {nextLocale.toUpperCase()}
          </button>
          {/* Opens the scan form with the keywords focused (also when already on Sources); the scan starts from there. */}
          <Link href="/app/sources?scan=1" aria-label={s.scanCta} title={s.scanCta} aria-current={onSources ? "page" : undefined} className="btn btn-outline ml-1.5 h-9 !min-h-9 shrink-0 !px-3.5">
            <Radar size={15} aria-hidden="true" />
            <span className="hidden md:inline">{s.scanCta}</span>
          </Link>
        </div>
      </header>

      <CommandPalette theme={theme} onHelp={openHelp} />

      <Dialog open={navOpen} onClose={() => setNavOpen(false)} title="Khedma" variant="drawer">
        <nav aria-label={t.a11y.navMain}>
          <NavList onNavigate={() => setNavOpen(false)} badges={data.badges} />
        </nav>
        <div className="mt-5 flex flex-col gap-0.5 border-t border-line pt-4">
          <Link href="/app/profile" className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2" onClick={() => setNavOpen(false)}>
            {s.nav.profile}
          </Link>
          <Link href="/app/settings" className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2" onClick={() => setNavOpen(false)}>
            {s.nav.settings}
          </Link>
        </div>
        <div className="mt-4 flex items-center gap-1 border-t border-line pt-4 sm:hidden">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => start(() => setTheme(nextTheme))}>
            <ThemeIcon size={16} aria-hidden="true" /> {t.common[nextTheme]}
          </button>
          <button type="button" className="btn btn-ghost btn-sm mono" onClick={() => start(() => setLocale(nextLocale))}>
            {nextLocale.toUpperCase()}
          </button>
        </div>
      </Dialog>

      <Dialog open={help} onClose={() => setHelp(false)} title={s.shortcuts.title}>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
          {[
            [["Ctrl", "K"], s.shortcuts.palette],
            [["/"], s.shortcuts.palette],
            [["N"], s.shortcuts.newOffer],
            [["G", "T"], s.shortcuts.goToday],
            [["G", "O"], s.shortcuts.goOffers],
            [["G", "P"], s.shortcuts.goPipeline],
            [["?"], s.shortcuts.help],
          ].map(([keys, label], i) => (
            <div key={i} className="contents">
              <dt className="flex gap-1">
                {(keys as string[]).map((k) => (
                  <kbd key={k} className="kbd">
                    {k}
                  </kbd>
                ))}
              </dt>
              <dd className="text-ink-2">{label as string}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </>
  );
}
