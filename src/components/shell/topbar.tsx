"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Bell, Menu as MenuIcon, Plus, Search, CalendarClock, AlarmClock, Flag } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Dialog } from "@/components/kit/dialog";
import { LangToggle, ThemeToggle } from "@/components/prefs-toggles";
import { Wordmark } from "@/components/logo";
import type { Notice } from "@/lib/notices";
import { CommandPalette } from "./command-palette";
import { NavList } from "./sidebar";

export function Topbar({
  theme,
  ai,
  notices,
}: {
  theme: "light" | "dark" | "system";
  ai: { online: boolean; label: string };
  notices: Notice[];
}) {
  const { t, locale } = useT();
  const [navOpen, setNavOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const openHelp = useCallback(() => setHelp(true), []);
  const urgent = notices.filter((n) => n.overdue || n.kind === "interview").length;
  const fmt = (s: string) =>
    new Date(s.length <= 10 ? s + "T00:00" : s).toLocaleString(locale === "fr" ? "fr-TN" : "en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(s.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}),
    });

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur-md sm:px-6 no-print">
        <button type="button" className="btn btn-ghost btn-icon lg:hidden" aria-label={t.shell2.openMenu} aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
          <MenuIcon size={18} aria-hidden="true" />
        </button>
        <Link href="/app" className="lg:hidden rounded-md" aria-label="Khedma">
          <Wordmark size={26} className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </Link>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("khedma:palette"))}
          className="ml-auto flex h-10 min-w-0 flex-1 max-w-md items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-muted transition-colors hover:border-line-strong lg:ml-0"
          aria-label={t.shell2.search}
        >
          <Search size={16} aria-hidden="true" />
          <span className="hidden truncate md:inline">{t.shell2.search}</span>
          <span className="ml-auto hidden items-center gap-1 xl:flex" aria-hidden="true">
            <kbd className="kbd">Ctrl</kbd>
            <kbd className="kbd">K</kbd>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/app/settings"
            className={`chip hidden xl:inline-flex ${ai.online ? "chip-success" : "chip-saffron"}`}
            title={ai.online ? ai.label : t.shell2.aiOfflineHint}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: "currentColor" }} />
            {ai.online ? `${t.shell2.aiOnline} · ${ai.label.replace("ollama:", "").replace("claude:", "Claude ")}` : t.shell2.aiOffline}
          </Link>

          <button
            type="button"
            className="btn btn-ghost btn-icon relative"
            popoverTarget="notices"
            aria-label={`${t.shell2.notifications}${notices.length ? ` (${notices.length})` : ""}`}
            style={{ anchorName: "--notices" } as React.CSSProperties}
          >
            <Bell size={18} aria-hidden="true" />
            {notices.length > 0 && (
              <span
                aria-hidden="true"
                className={`absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold leading-4 ${
                  urgent ? "bg-danger text-white" : "bg-accent text-accent-ink"
                }`}
              >
                {notices.length}
              </span>
            )}
          </button>
          <div
            id="notices"
            popover="auto"
            className="menu w-[min(360px,calc(100vw-2rem))] !p-0"
            style={{ positionAnchor: "--notices", top: "anchor(bottom)", right: "anchor(right)", marginTop: 6 } as React.CSSProperties}
          >
            <p className="border-b border-line px-4 py-3 text-sm font-semibold">{t.shell2.notifications}</p>
            {notices.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">{t.shell2.noNotifications}</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto p-1.5">
                {notices.map((n) => {
                  const Icon = n.kind === "interview" ? CalendarClock : n.kind === "deadline" ? Flag : AlarmClock;
                  return (
                    <li key={n.key}>
                      <Link href={n.href} className="menu-item !items-start" onClick={(e) => (e.currentTarget.closest("[popover]") as HTMLElement)?.hidePopover()}>
                        <Icon size={16} aria-hidden="true" className={`mt-0.5 shrink-0 ${n.overdue ? "text-danger" : "text-accent-text"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink">{n.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {n.overdue ? `${t.shell2.overdue} · ` : n.kind === "interview" ? `${t.shell2.interviewSoon} · ` : `${t.shell2.due} · `}
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
            <Link href="/app/calendar" className="block border-t border-line px-4 py-2.5 text-sm font-medium text-accent-text hover:bg-surface-2">
              {t.shell2.seeCalendar} →
            </Link>
          </div>

          <span className="hidden sm:contents">
            <LangToggle />
            <ThemeToggle current={theme} />
          </span>
          <Link href="/app/jobs/new" className="btn btn-primary btn-sm ml-1">
            <Plus size={16} aria-hidden="true" />
            <span className="hidden md:inline">{t.shell2.quickAdd}</span>
          </Link>
        </div>
      </header>

      <CommandPalette theme={theme} onHelp={openHelp} />

      <Dialog open={navOpen} onClose={() => setNavOpen(false)} title="Khedma" variant="drawer">
        <nav aria-label={t.a11y.navMain}>
          <NavList onNavigate={() => setNavOpen(false)} />
        </nav>
        <div className="mt-6 flex items-center gap-1 border-t border-line pt-4 sm:hidden">
          <LangToggle />
          <ThemeToggle current={theme} />
        </div>
      </Dialog>

      <Dialog open={help} onClose={() => setHelp(false)} title={t.shell2.shortcuts.title}>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
          {[
            [["Ctrl", "K"], t.shell2.shortcuts.palette],
            [["/"], t.shell2.shortcuts.palette],
            [["N"], t.shell2.shortcuts.newOffer],
            [["G", "T"], t.shell2.shortcuts.goToday],
            [["G", "O"], t.shell2.shortcuts.goOffers],
            [["G", "P"], t.shell2.shortcuts.goPipeline],
            [["?"], t.shell2.shortcuts.help],
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
