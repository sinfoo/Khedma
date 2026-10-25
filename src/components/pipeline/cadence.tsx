// Server-safe cadence visuals: a small urgency chip (board cards, tables) and the workspace banner.
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { logOutcome } from "@/app/actions/apply";
import { AlarmClock, MessageSquareReply, Snowflake, Zap } from "lucide-react";
import type { Dict } from "@/lib/i18n/dict";
import { fmt } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/types";
import type { Cadence, FollowupAngle, Urgency } from "@/lib/apps/cadence";
import { shortDate } from "./format";

/** The subset of a Cadence that travels to client components. */
export interface CadenceView {
  urgency: Urgency;
  angle: FollowupAngle;
  nextDue: string | null;
  followupCount: number;
  latency: number | null;
  silentDays: number | null;
}
export const toView = (c: Cadence | undefined): CadenceView | null =>
  c && c.urgency !== "none" ? { urgency: c.urgency, angle: c.angle, nextDue: c.nextDue, followupCount: c.followupCount, latency: c.companyLatencyDays, silentDays: c.silentDays } : null;

const CLS: Record<Urgency, string> = { urgent: "chip-danger", overdue: "chip-saffron", waiting: "", cold: "", none: "" };
const ICON: Record<Urgency, React.ReactNode> = {
  urgent: <Zap size={11} aria-hidden="true" />,
  overdue: <AlarmClock size={11} aria-hidden="true" />,
  waiting: <MessageSquareReply size={11} aria-hidden="true" />,
  cold: <Snowflake size={11} aria-hidden="true" />,
  none: null,
};

/** Compact chip; "waiting" renders nothing unless `showWaiting`. */
export function CadenceChip({ c, t, locale, showWaiting = false }: { c: CadenceView | null; t: Dict; locale: Locale; showWaiting?: boolean }) {
  if (!c || (c.urgency === "waiting" && !showWaiting)) return null;
  const m = t.apps2.cadence;
  const label = c.urgency === "waiting" && c.nextDue ? fmt(m.nextDue, { date: shortDate(c.nextDue, locale) }) : c.urgency === "overdue" ? m.due[c.angle] : m.urgency[c.urgency];
  const angle = c.urgency === "overdue" || c.urgency === "urgent" ? m.angle[c.angle] : "";
  return (
    <span className={`chip !py-0 text-[0.7rem] ${CLS[c.urgency]} ${c.urgency === "cold" ? "text-muted" : ""}`} title={angle || undefined}>
      {ICON[c.urgency]} {label}
      {angle && <span className="sr-only"> · {angle}</span>}
    </span>
  );
}

/** Workspace banner under the header: urgency, angle, next date, company latency, silence flag. */
export function CadenceBanner({ id, c, t, locale }: { id: number; c: CadenceView | null; t: Dict; locale: Locale }) {
  if (!c) return null;
  const m = t.apps2.cadence;
  const tone = c.urgency === "urgent" ? "border-danger/40 bg-danger-soft" : c.urgency === "overdue" ? "border-saffron/40 bg-saffron-soft" : c.urgency === "cold" ? "border-line bg-surface-2" : "border-line bg-surface";
  // Headline and button name the same message: "Thank-you note due" next to "Thank-you note".
  const long = c.urgency === "waiting" ? fmt(m.nextLong[c.angle], { date: shortDate(c.nextDue, locale) }) : c.urgency === "overdue" ? m.dueLong[c.angle] : m.urgencyLong[c.urgency];
  const draft = c.urgency === "overdue" || c.urgency === "urgent" ? c.angle : null;
  return (
    <aside className={`no-print mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 text-sm ${tone}`} aria-label={c.urgency === "overdue" ? m.due[c.angle] : m.urgency[c.urgency]}>
      <CadenceChip c={c} t={t} locale={locale} showWaiting />
      <span className="text-ink-2">{long}</span>
      {c.followupCount > 0 && <span className="mono text-xs text-muted tabular">{fmt(m.sent, { n: c.followupCount })}</span>}
      {c.latency !== null && <span className="text-xs text-muted">{fmt(m.latency, { n: c.latency })}</span>}
      {c.silentDays !== null && <span className="text-xs text-danger">{fmt(m.silent, { n: c.silentDays })}</span>}
      {draft && draft !== "none" && (
        <Link href={`/app/pipeline/${id}?tab=messages&draft=${draft}`} className="btn btn-primary btn-sm ml-auto">
          {m.angle[draft]}
        </Link>
      )}
      {c.urgency === "cold" && (
        <span className="ml-auto flex gap-1.5">
          <Link href={`/app/pipeline/${id}?tab=contacts`} className="btn btn-secondary btn-sm">{m.coldContact}</Link>
          <ActionButton action={logOutcome.bind(null, id, "ghosted", "", "")} className="btn btn-outline btn-sm">{m.closeGhosted}</ActionButton>
        </span>
      )}
    </aside>
  );
}
