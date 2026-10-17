"use client";

import { Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";

/** Header action: asks the offers browser (which owns the sequential evaluation) to score every unscored offer. */
export function ScoreNewButton({ n }: { n: number }) {
  const { t } = useT();
  if (!n) return null;
  return (
    <button type="button" className="btn btn-saffron" onClick={() => window.dispatchEvent(new Event("khedma:score-pending"))}>
      <Sparkles size={15} aria-hidden="true" /> {fmt(t.offers2.list2.scoreNew, { n })}
    </button>
  );
}
