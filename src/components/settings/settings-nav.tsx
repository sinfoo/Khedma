"use client";

import { useEffect, useState } from "react";

/** Sticky in-page section nav; marks the section in view with aria-current. */
export function SettingsNav({ label, items }: { label: string; items: { id: string; label: string }[] }) {
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
    <nav aria-label={label} className="lg:sticky lg:top-24">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "location" : undefined}
              onClick={() => setActive(i.id)}
              className={`flex min-h-9 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
                active === i.id ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
