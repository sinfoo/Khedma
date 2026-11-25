"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Fire before a navigation that does not start from a link (router.push from a shortcut or the palette). */
export const NAV_START = "khedma:navstart";

/**
 * Thin progress bar at the top of the page during client navigations. Starts on an internal link click, on
 * back/forward and on NAV_START; ends when the URL actually changes. Arriving on a new page also moves keyboard
 * focus to <main>, so Tab continues in the page and not in the sidebar link that was clicked.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = `${pathname}?${search}`;
  const shown = useRef({ url, pathname });

  useEffect(() => {
    const begin = () => {
      setState("loading");
      // Safety net: never leave the bar stuck if the navigation was cancelled.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 8000);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      // /api links are downloads and exports: the URL never changes, so the bar would hang.
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      begin();
    };
    document.addEventListener("click", onClick, true);
    // Back/forward; a hash-only step keeps the page, so no bar.
    const onPop = () => `${location.pathname}?${new URLSearchParams(location.search)}` !== shown.current.url && begin();
    window.addEventListener("popstate", onPop);
    window.addEventListener(NAV_START, begin);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener(NAV_START, begin);
    };
  }, []);

  // URL changed: finish the bar (deferred so the effect itself doesn't set state).
  useEffect(() => {
    shown.current.url = url;
    const done = setTimeout(() => setState((s) => (s === "loading" ? "done" : s)), 0);
    const idle = setTimeout(() => setState("idle"), 350);
    return () => {
      clearTimeout(done);
      clearTimeout(idle);
    };
  }, [url]);

  // New page (not a filter change on the same page, not the first load): focus the content region.
  useEffect(() => {
    if (shown.current.pathname === pathname) return;
    shown.current.pathname = pathname;
    const main = document.getElementById("main");
    // A page that focuses its own field (autoFocus) keeps it.
    if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-[2px] bg-accent"
      style={{
        transformOrigin: "left",
        transform: state === "loading" ? "scaleX(0.7)" : state === "done" ? "scaleX(1)" : "scaleX(0)",
        opacity: state === "idle" ? 0 : 1,
        // Idle fades out at full width, then resets its width unseen (no bar sliding backwards).
        transition: state === "loading" ? "transform 4s ease-out" : state === "done" ? "transform 200ms ease-out" : "opacity 200ms ease-out, transform 0s 200ms",
      }}
    />
  );
}
