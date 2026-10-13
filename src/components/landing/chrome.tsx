import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Dict } from "@/lib/i18n/dict";
import { Wordmark } from "@/components/logo";
import { LangToggle, ThemeToggle } from "@/components/prefs-toggles";
import s from "./styles";

export const GITHUB_URL = "https://github.com/sinfoo/Khedma";

type Theme = "light" | "dark" | "system";

export function LandingNav({ t, theme, current }: { t: Dict; theme: Theme; current?: "guide" }) {
  const L = t.landing2.nav;
  const links = [
    { href: "/#how", label: L.how },
    { href: "/#features", label: L.features },
    { href: "/#privacy", label: L.privacy },
    { href: "/guide", label: L.guide, current: current === "guide" },
  ];
  const linkCls =
    "inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink aria-[current=page]:text-ink aria-[current=page]:bg-surface-2";
  return (
    <header className={`${s.night} sticky top-0 z-40 border-b border-line bg-[rgb(8_11_17/0.85)] backdrop-blur-md`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" aria-label={L.home} className="shrink-0 rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label={L.label} className="ml-6 hidden md:block">
          <ul className="flex items-center gap-0.5">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={linkCls} aria-current={l.current ? "page" : undefined}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-0.5">
          <LangToggle />
          <ThemeToggle current={theme} />
          <Link href="/app" className="btn btn-primary btn-sm ml-1.5">
            {L.open}
            <span className="sr-only sm:not-sr-only">&nbsp;{L.openRest}</span>
          </Link>
        </div>
      </div>
      {/* Small screens: the section links scroll horizontally in their own strip. */}
      <nav aria-label={L.label} className="overflow-x-auto border-t border-line md:hidden">
        <ul className="flex w-max items-center gap-0.5 px-2 py-1">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className={linkCls} aria-current={l.current ? "page" : undefined}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

export function LandingFooter({ t }: { t: Dict }) {
  const F = t.landing2.footer;
  return (
    <footer className={`${s.night} relative border-t border-line`}>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Wordmark size={32} />
          <p className="mt-4 max-w-md text-sm text-muted">{F.project}</p>
        </div>
        <nav aria-label={F.label}>
          <ul className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
            <li>
              <Link href="/guide" className="inline-flex min-h-10 items-center rounded-lg px-3 text-ink-2 hover:bg-surface-2 hover:text-ink">
                {F.guide}
              </Link>
            </li>
            <li>
              <Link href="/app" className="inline-flex min-h-10 items-center rounded-lg px-3 text-ink-2 hover:bg-surface-2 hover:text-ink">
                {F.app}
              </Link>
            </li>
            <li>
              <a
                href={GITHUB_URL}
                rel="noopener"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <GithubMark />
                {F.github}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
