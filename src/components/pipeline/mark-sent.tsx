"use client";

import { useRouter } from "next/navigation";
import { CircleCheck, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import type { AppState } from "@/lib/types";
import { useStageMove } from "./stage";

/**
 * "I've sent it": the one place the workspace marks an application as sent. Warns when the CV or letter
 * is missing, then moves the card through the shared stage move (toast + undo) and opens the after-step.
 */
export function MarkSentButton({ id, status, title, missing, afterHref, className = "btn btn-saffron !h-10" }: { id: number; status: AppState; title: string; missing: ("cv" | "letter")[]; afterHref: string; className?: string }) {
  const { t } = useT();
  const F = t.apps2.flow;
  const router = useRouter();
  const { move, node, pending } = useStageMove();
  const onClick = () => {
    const docs = missing.map((k) => (k === "cv" ? F.packCv : F.packLetter)).join(" + ");
    // ponytail: native confirm is plain but accessible; swap for the kit Dialog if it needs styling.
    if (missing.length && !window.confirm(fmt(F.missingDocs, { docs }))) return;
    move({ id, status, title }, "applied", () => router.push(afterHref));
  };
  return (
    <>
      {node}
      <button type="button" className={className} disabled={pending} aria-busy={pending} onClick={onClick}>
        {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CircleCheck size={14} aria-hidden="true" />} {F.markApplied}
      </button>
    </>
  );
}
