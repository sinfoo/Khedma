"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/** A shell command with a copy button. */
export function Command({ cmd }: { cmd: string }) {
  const { t } = useT();
  const G = t.landing2.guide;
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      // Clipboard can be blocked (insecure context, permissions): the text stays selectable.
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 py-1 pl-4 pr-1">
      <span aria-hidden="true" className="mono select-none text-muted">
        $
      </span>
      <code className="mono min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-1.5 text-[0.86rem] text-ink">{cmd}</code>
      <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={copy} aria-label={`${G.copyLabel} — ${cmd}`}>
        {done ? <Check size={15} aria-hidden="true" className="text-success" /> : <Copy size={15} aria-hidden="true" />}
        <span className="hidden sm:inline">{done ? G.copied : G.copy}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {done ? G.copied : ""}
      </span>
    </div>
  );
}
