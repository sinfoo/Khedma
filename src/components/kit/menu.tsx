"use client";

import { useId } from "react";

/**
 * Dropdown menu on the native Popover API (light dismiss, Esc, top layer for free).
 * Anchored under its trigger with CSS anchor positioning where supported (centred otherwise, see globals.css).
 * Plain buttons in Tab order, not role="menu": that role promises arrow-key navigation this does not do.
 */
export function Menu({
  label,
  trigger,
  children,
  align = "end",
  triggerClassName = "btn btn-ghost btn-icon btn-sm",
}: {
  label: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  triggerClassName?: string;
}) {
  const id = useId().replace(/:/g, "");
  const anchor = `--menu-${id}`;
  return (
    <>
      <button type="button" className={triggerClassName} popoverTarget={`menu-${id}`} aria-label={label} style={{ anchorName: anchor } as React.CSSProperties}>
        {trigger}
      </button>
      <div
        id={`menu-${id}`}
        popover="auto"
        aria-label={label}
        className="menu"
        style={
          {
            positionAnchor: anchor,
            top: "anchor(bottom)",
            [align === "end" ? "right" : "left"]: align === "end" ? "anchor(right)" : "anchor(left)",
            marginTop: 6,
          } as React.CSSProperties
        }
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-close]")) (e.currentTarget as HTMLElement).hidePopover();
        }}
      >
        {children}
      </div>
    </>
  );
}

export function MenuItem({ children, onClick, danger, href }: { children: React.ReactNode; onClick?: () => void; danger?: boolean; href?: string }) {
  const cls = `menu-item ${danger ? "!text-danger" : ""}`;
  if (href)
    return (
      <a href={href} className={cls} data-close>
        {children}
      </a>
    );
  return (
    <button type="button" className={cls} onClick={onClick} data-close>
      {children}
    </button>
  );
}
