"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin progress bar under the top bar during client navigations.
 * Starts on any internal link click, ends when the URL actually changes.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState("loading");
      // Safety net: never leave the bar stuck if the navigation was cancelled.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 8000);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // URL changed: finish the bar.
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    const id = setTimeout(() => setState("idle"), 350);
    return () => clearTimeout(id);
  }, [pathname, search]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-[2px] bg-accent transition-[transform,opacity] ease-out"
      style={{
        transformOrigin: "left",
        transform: state === "loading" ? "scaleX(0.7)" : state === "done" ? "scaleX(1)" : "scaleX(0)",
        opacity: state === "idle" ? 0 : 1,
        transitionDuration: state === "loading" ? "4s" : "250ms",
      }}
    />
  );
}
