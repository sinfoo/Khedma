"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { Wordmark } from "@/components/logo";
import { NAV_GROUPS, isActive } from "./nav-items";

/** Grouped navigation list, shared by the desktop sidebar and the mobile drawer. */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { t } = useT();
  return (
    <div className="flex flex-col gap-5">
      {NAV_GROUPS.map((g) => (
        <div key={g.key}>
          <p className="px-3 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">{t.shell2.groups[g.key]}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const active = isActive(path, item);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    {active && <span aria-hidden="true" className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent" />}
                    <item.Icon size={17} aria-hidden="true" className={active ? "text-accent-text" : "text-muted group-hover:text-ink"} />
                    {t.shell2.nav[item.key]}
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

export function Sidebar() {
  const { t } = useT();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-bg-elev lg:flex no-print">
      <div className="px-5 pt-5 pb-6">
        <Link href="/" className="inline-block rounded-md" aria-label="Khedma">
          <Wordmark />
        </Link>
      </div>
      <nav aria-label={t.a11y.navMain} className="flex-1 overflow-y-auto px-3 pb-4">
        <NavList />
      </nav>
      <p className="border-t border-line px-5 py-3 text-[0.72rem] leading-snug text-muted">
        {t.shell2.footer} · <Link href="/about" className="underline underline-offset-2 hover:text-ink">{t.about2.nav}</Link>
      </p>
    </aside>
  );
}
