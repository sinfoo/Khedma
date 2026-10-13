"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/kit/toast";
import { EngineChip } from "@/components/ui";
import { polishDigest } from "@/app/actions/reports";

/** Optional AI rewrite of the week's focus list; the heuristic list stays visible until it lands. */
export function PolishFocus({ week }: { week: string }) {
  const { t } = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [out, setOut] = useState<{ text: string; engine: string } | null>(null);
  return (
    <div className="mt-3">
      <button type="button" className="btn btn-secondary btn-sm" disabled={pending} aria-busy={pending}
        onClick={() => start(async () => { const r = await polishDigest(week); if (r.ok) setOut({ text: r.text, engine: r.engine }); else toast.error(t.common.error, r.error); })}>
        {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
        {out ? t.common.regenerate : t.apply2.reports.polish}
      </button>
      <div aria-live="polite">
        {out && (
          <div className="mt-3 rounded-xl bg-surface-2 p-4 text-sm leading-relaxed fade">
            <div className="mb-2"><EngineChip engine={out.engine} t={t} /></div>
            <p>{out.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}
