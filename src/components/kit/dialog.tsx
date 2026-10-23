"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/**
 * Modal or side drawer on the native <dialog> element: focus trap, Esc to close
 * and inert background come from the browser. Controlled with `open`/`onClose`.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "modal",
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  variant?: "modal" | "drawer";
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  const kit = useT().t.shell2.kit;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal ${variant === "drawer" ? "drawer" : ""}`}
      style={wide && variant === "modal" ? { width: "min(860px, calc(100vw - 2rem))" } : undefined}
      aria-labelledby="dlg-title"
      aria-describedby={description ? "dlg-desc" : undefined}
      onClose={onClose}
      onMouseDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        // A click that both starts and ends on the backdrop (the dialog element itself) closes it.
        if (e.target === e.currentTarget && downOnBackdrop.current) onClose();
      }}
    >
      {open && (
        <div className={`flex flex-col ${variant === "drawer" ? "h-full" : "max-h-[calc(100dvh-4rem)]"}`}>
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id="dlg-title" className="text-lg">{title}</h2>
              {description && <p id="dlg-desc" className="text-sm text-muted mt-0.5">{description}</p>}
            </div>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={kit.close} onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
