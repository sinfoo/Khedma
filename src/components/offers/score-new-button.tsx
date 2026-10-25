"use client";

import { Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { BEST_BATCH, scoreTime } from "@/lib/offers-filter";

/**
 * Header action: asks the offers browser (which owns the sequential evaluation) to score the best unscored matches,
 * 20 at most, and says what that costs with the active engine.
 */
export function ScoreNewButton({ n, online, engine }: { n: number; online: boolean; engine: string }) {
  const { t } = useT();
  if (!n) return null;
  const k = Math.min(BEST_BATCH, n);
  const hint = fmt(t.offers2.list2.scoreNewHint, { engine, each: online ? "≈ 10 s" : "< 1 s", time: scoreTime(k, online), n: k, all: n, total: scoreTime(n, online) });
  return (
    <button type="button" className="btn btn-outline" title={hint} onClick={() => window.dispatchEvent(new Event("khedma:score-pending"))}>
      <Sparkles size={15} aria-hidden="true" /> {fmt(t.offers2.list2.scoreNew, { n: k })}
    </button>
  );
}
