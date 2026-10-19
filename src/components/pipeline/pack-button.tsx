"use client";

import { useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/components/kit/toast";
import { useT } from "@/lib/i18n/client";
import { generatePack } from "@/app/actions/applications";

/** One click writes the missing CV and letter together, so "Apply" never lands on an empty pack. */
export function PackButton({ id }: { id: number }) {
  const { t } = useT();
  const F = t.apps2.flow;
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-saffron-soft px-3.5 py-3">
      <p className="min-w-0 flex-1 text-[0.82rem] text-ink-2">{pending ? F.packWriting : F.packHint}</p>
      <button
        type="button"
        className="btn btn-saffron btn-sm"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            const r = await generatePack(id);
            if (r.ok) toast.success(F.packDone);
            else toast.error(r.error);
          })
        }
      >
        {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />} {F.packGenerate}
      </button>
    </div>
  );
}
