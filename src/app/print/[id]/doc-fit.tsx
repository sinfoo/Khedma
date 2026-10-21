"use client";

import { useLayoutEffect } from "react";

/**
 * "Fit to one page" (after Reactive Resume): when the sheet spills a little onto one more page, apply the shrink
 * steps one by one (density, margins, text size ≥ 9pt) until it fits; if it never fits, put everything back.
 * Runs before paint, so the preview, the browser print and the headless PDF all get the fitted sheet.
 */
export function DocFit({ steps, paper, pageHeightMm }: { steps: Record<string, string>[]; paper: string; pageHeightMm: number }) {
  useLayoutEffect(() => {
    const page = document.querySelector<HTMLElement>(".doc-page");
    const sheet = page?.querySelector<HTMLElement>(".doc-sheet");
    const css = document.getElementById("doc-page-css");
    if (!page || !sheet || !css) return;
    const mm = (v: string) => parseFloat(getComputedStyle(page).getPropertyValue(v)) || 0;
    const pagePx = () => ((pageHeightMm - 2 * mm("--doc-my")) * 96) / 25.4;
    const pagesNeeded = () => Math.ceil(sheet.scrollHeight / pagePx());
    const setPageCss = () => (css.textContent = `@page { size: ${paper}; margin: ${mm("--doc-my")}mm ${mm("--doc-mx")}mm; }`);

    const run = () => {
      const start = pagesNeeded();
      // Only a small spill is worth squeezing: under a third of a page.
      if (start < 2 || sheet.scrollHeight - (start - 1) * pagePx() > pagePx() / 3) return;
      const before = page.getAttribute("style") ?? "";
      for (const step of steps) {
        for (const [k, v] of Object.entries(step)) page.style.setProperty(k, v);
        setPageCss();
        if (pagesNeeded() < start) return;
      }
      page.setAttribute("style", before);
      setPageCss();
    };
    run();
    // Webfonts change the measure once they arrive.
    document.fonts?.ready.then(run).catch(() => {});
  }, [steps, paper, pageHeightMm]);
  return null;
}
