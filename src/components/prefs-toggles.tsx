"use client";

import { useTransition } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { setLocale, setTheme } from "@/app/actions/prefs";
import { useT } from "@/lib/i18n/client";

export function LangToggle() {
  const { locale, t } = useT();
  const [pending, start] = useTransition();
  const next = locale === "fr" ? "en" : "fr";
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm mono"
      aria-label={`FR / EN, ${t.a11y.langToggle}: ${next.toUpperCase()}`}
      aria-busy={pending}
      onClick={() => start(() => setLocale(next))}
    >
      <span aria-hidden="true" className={locale === "fr" ? "text-ink" : "text-muted"}>FR</span>
      <span aria-hidden="true" className="text-muted">/</span>
      <span aria-hidden="true" className={locale === "en" ? "text-ink" : "text-muted"}>EN</span>
    </button>
  );
}

export function ThemeToggle({ current }: { current: "light" | "dark" | "system" }) {
  const { t } = useT();
  const [pending, start] = useTransition();
  const order = ["system", "light", "dark"] as const;
  const next = order[(order.indexOf(current) + 1) % order.length];
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-label={`${t.a11y.themeToggle}: ${t.common[next]}`}
      title={t.common[current]}
      aria-busy={pending}
      onClick={() => start(() => setTheme(next))}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
