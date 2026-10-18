"use client";

import { useEffect } from "react";

/** Opens the print dialog once the document has painted; the hint stays off paper. */
export function AutoPrint({ hint, again }: { hint: string; again: string }) {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 300);
    return () => clearTimeout(id);
  }, []);
  return (
    <p className="no-print mb-8 flex flex-wrap items-center gap-3 rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
      {hint}
      <button type="button" className="ml-auto rounded-md border border-neutral-300 bg-white px-3 py-1 font-semibold" onClick={() => window.print()}>
        {again}
      </button>
    </p>
  );
}
