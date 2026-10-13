"use client";

import { useId } from "react";
import { HelpCircle } from "lucide-react";

/** "Why this?" explanation on the native Popover API (light dismiss, Esc, top layer). */
export function WhyPopover({ label, title, items, className = "btn btn-ghost btn-sm" }: { label: string; title?: string; items: string[]; className?: string }) {
  const id = useId().replace(/:/g, "");
  const anchor = `--why-${id}`;
  if (!items.length) return null;
  return (
    <>
      <button type="button" className={className} popoverTarget={`why-${id}`} style={{ anchorName: anchor } as React.CSSProperties}>
        <HelpCircle size={14} aria-hidden="true" /> {label}
      </button>
      <div
        id={`why-${id}`}
        popover="auto"
        role="dialog"
        aria-label={title ?? label}
        className="menu w-[min(320px,calc(100vw-2rem))] !p-3.5"
        style={{ positionAnchor: anchor, top: "anchor(bottom)", left: "anchor(left)", marginTop: 6 } as React.CSSProperties}
      >
        {title && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">{title}</p>}
        <ul className="space-y-1.5 text-sm">
          {items.map((s) => (
            <li key={s} className="flex gap-2">
              <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
