"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radar, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { fmtDate } from "@/components/ui";
import { archiveClosedOffers, checkCompanyOffers, checkTrackedOffers, type CheckSummary } from "@/app/actions/company";
import type { JobCheck, Liveness } from "@/lib/company";

const CLS: Record<Liveness, string> = { open: "chip-success", closed: "chip-danger", unknown: "chip-saffron" };

export function LivenessChip({ status, checkedAt }: { status: Liveness; checkedAt?: string | null }) {
  const { t, locale } = useT();
  const o = t.company2.offers;
  return (
    <span className={`chip ${CLS[status]}`} title={checkedAt ? fmt(o.checked, { d: fmtDate(checkedAt, locale) }) : undefined}>
      <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-current" />
      {o[status]}
      {checkedAt && <span className="sr-only"> · {fmt(o.checked, { d: fmtDate(checkedAt, locale) })}</span>}
    </span>
  );
}

/** "Check if still open" for one offer; shows the last result as a chip and offers to archive a closed posting. */
export function LivenessButton({ jobId, initial = null, compact = false }: { jobId: number; initial?: Pick<JobCheck, "status" | "checked_at"> | null; compact?: boolean }) {
  const { t, locale } = useT();
  const o = t.company2.offers;
  const toast = useToast();
  const router = useRouter();
  const [result, setResult] = useState(initial);
  const [pending, setPending] = useState(false);

  const check = async () => {
    setPending(true);
    try {
      const r = await fetch("/api/company/liveness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [jobId] }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { results } = (await r.json()) as { results: JobCheck[] };
      const c = results[0];
      if (!c) throw new Error("no result");
      setResult(c);
      if (c.status === "closed") {
        toast.info(o.closedHint, c.reason, {
          label: o.archive,
          onClick: () => {
            void archiveClosedOffers([jobId]).then(() => {
              toast.success(o.archivedOne);
              router.refresh();
            });
          },
        });
      }
    } catch (e) {
      toast.error(t.common.error, (e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" aria-live="polite">
      {result ? <LivenessChip status={result.status} checkedAt={result.checked_at} /> : !compact && <span className="text-xs text-muted">{o.never}</span>}
      {result?.checked_at && !compact && <span className="text-xs text-muted tabular">{fmtDate(result.checked_at, locale)}</span>}
      <button type="button" className={`btn btn-ghost btn-sm ${compact ? "btn-icon" : ""}`} onClick={check} disabled={pending} aria-busy={pending} aria-label={o.check} title={o.check}>
        {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
        {!compact && (result ? null : o.check)}
      </button>
    </span>
  );
}

/** Batch check: all tracked offers (no slug) or one company's open offers. Suggests archiving closed ones. */
export function CheckOffersButton({ slug, className = "btn btn-secondary" }: { slug?: string; className?: string }) {
  const { t } = useT();
  const c = t.company2;
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      const s: CheckSummary = slug ? await checkCompanyOffers(slug) : await checkTrackedOffers();
      if (!s.checked) {
        toast.info(c.nothingToCheck);
        return;
      }
      const body = fmt(c.checkDone, { open: s.open, closed: s.closed, unknown: s.unknown });
      if (s.closedIds.length) {
        toast.info(body, undefined, {
          label: fmt(c.archiveClosed, { n: s.closedIds.length }),
          onClick: () => {
            void archiveClosedOffers(s.closedIds).then((n) => {
              toast.success(fmt(c.archived, { n }));
              router.refresh();
            });
          },
        });
      } else toast.success(body);
      router.refresh();
    });

  return (
    <button type="button" className={className} onClick={run} disabled={pending} aria-busy={pending}>
      {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Radar size={16} aria-hidden="true" />}
      {pending ? c.checking : slug ? c.offers.checkAll : c.checkAll}
    </button>
  );
}
