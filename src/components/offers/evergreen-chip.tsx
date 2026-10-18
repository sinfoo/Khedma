import { Hourglass } from "lucide-react";
import { fmt, type Dict } from "@/lib/i18n/dict";
import type { EvergreenReason } from "@/lib/evergreen";

const reasonText = (r: EvergreenReason, t: Dict) => (r.kind === "phrase" ? fmt(t.offers2.evergreen.phrase, { p: r.phrase }) : fmt(t.offers2.evergreen.reposts, { n: r.n }));

/** Muted hint, never a verdict: the reasons ride in the tooltip (rows) or next to the chip (offer page). */
export function EvergreenChip({ reasons, t, full = false }: { reasons: EvergreenReason[]; t: Dict; full?: boolean }) {
  if (!reasons.length) return null;
  const e = t.offers2.evergreen;
  const why = reasons.map((r) => reasonText(r, t)).join(" · ");
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`chip text-muted ${full ? "" : "!py-0 text-[0.68rem]"}`} title={`${why}. ${e.hint}`}>
        <Hourglass size={full ? 12 : 11} aria-hidden="true" /> {e.chip}
        {!full && <span className="sr-only">: {why}</span>}
      </span>
      {full && <span className="text-[0.75rem] text-muted">{why}. {e.hint}</span>}
    </span>
  );
}
