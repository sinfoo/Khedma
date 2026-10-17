"use client";

import { useEffect, useState } from "react";

/** Sticky in-page section nav; marks the section in view with aria-current. */
export function SettingsNav({ label, items }: { label: string; items: { id: string; label: string; icon?: React.ReactNode }[] }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    // Last section whose top has passed 30% of the viewport is the current one.
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let cur = items[0]?.id;
      for (const i of items) {
        const el = document.getElementById(i.id);
        if (el && el.getBoundingClientRect().top <= line) cur = i.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = items[items.length - 1]?.id;
      setActive(cur);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [items]);
  return (
    <nav aria-label={label} className="lg:sticky lg:top-[76px]">
      <ul className="flex gap-0.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "location" : undefined}
              onClick={() => setActive(i.id)}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-[10px] px-2.5 py-[9px] text-[0.85rem] transition-colors ${
                active === i.id ? "bg-accent-soft font-semibold text-ink" : "font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {i.icon && <span className={active === i.id ? "text-accent-text" : "text-muted"} aria-hidden="true">{i.icon}</span>}
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
