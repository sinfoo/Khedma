import type { Evaluation } from "@/lib/types";
import type { Dict } from "@/lib/i18n/dict";
import { scoreColor } from "./ui";

const DIMS = ["match", "target", "growth", "culture", "red_flags"] as const;

export function ScoreBreakdown({ ev, t }: { ev: Evaluation; t: Dict }) {
  return (
    <dl className="space-y-2.5">
      {DIMS.map((k, i) => (
        <div key={k} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3 text-sm rise" style={{ ["--i" as string]: i + 1 }}>
          <dt className="text-ink-2">
            {t.dims[k]}
            {/* High is good here (few red flags): say so, or a full green bar reads as "lots of danger". */}
            {k === "red_flags" && <span className="block text-[0.7rem] text-muted">{t.offers2.redFlagsScale}</span>}
          </dt>
          <dd className="h-2 rounded-full bg-surface-2 overflow-hidden m-0">
            <span
              className="block h-full rounded-full"
              style={{ width: `${((ev[k] - 1) / 4) * 100}%`, background: scoreColor(ev[k]), transition: "width .6s cubic-bezier(.2,.7,.2,1)" }}
            />
          </dd>
          <dd className="mono text-xs text-right m-0">{ev[k].toFixed(1)}</dd>
        </div>
      ))}
    </dl>
  );
}
