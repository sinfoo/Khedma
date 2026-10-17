"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, RefreshCw, Sparkles, Star, Undo2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { Dialog } from "@/components/kit/dialog";
import { rateCompany, researchCompany, researchTop, setBlacklist } from "@/app/actions/company";

/** 1–5 star rating; clicking the current value clears it. */
export function RatingStars({ slug, rating }: { slug: string; rating: number }) {
  const { t } = useT();
  const c = t.company2;
  const toast = useToast();
  const [value, setValue] = useOptimistic(rating);
  const [, start] = useTransition();
  const set = (n: number) =>
    start(async () => {
      setValue(n);
      await rateCompany(slug, n);
      toast.success(c.rated);
    });
  return (
    <div role="group" aria-label={c.rating} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-saffron focus-visible:outline-2"
          style={n <= value ? { color: "var(--saffron)" } : undefined}
          aria-label={n === value ? c.clearRating : fmt(c.rate, { n })}
          aria-pressed={n <= value}
          onClick={() => set(n === value ? 0 : n)}
        >
          <Star size={16} aria-hidden="true" fill={n <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

export function BlacklistToggle({ slug, name, blacklisted }: { slug: string; name: string; blacklisted: boolean }) {
  const { t } = useT();
  const c = t.company2;
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const apply = (on: boolean) =>
    start(async () => {
      await setBlacklist(slug, on, reason);
      setOpen(false);
      toast.success(fmt(on ? c.blacklistedToast : c.unblacklistedToast, { name }));
    });

  if (blacklisted)
    return (
      <button type="button" className="btn btn-secondary" onClick={() => apply(false)} disabled={pending} aria-busy={pending}>
        {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Undo2 size={16} aria-hidden="true" />} {c.unblacklist}
      </button>
    );
  return (
    <>
      <button type="button" className="btn btn-ghost !text-danger" onClick={() => setOpen(true)}>
        <Ban size={16} aria-hidden="true" /> {c.blacklist}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={fmt(c.blacklistTitle, { name })}
        description={c.blacklistHint}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>{t.common.cancel}</button>
            <button type="button" className="btn btn-danger" onClick={() => apply(true)} disabled={pending} aria-busy={pending}>
              {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {c.blacklist}
            </button>
          </>
        }
      >
        <label className="label" htmlFor="bl-reason">{c.reason} <span className="text-muted">({t.common.optional})</span></label>
        <textarea id="bl-reason" className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={c.reasonPh} maxLength={300} />
      </Dialog>
    </>
  );
}

/** Run (or refresh) research for one company. */
export function ResearchButton({ slug, researched, className = "btn btn-primary" }: { slug: string; researched: boolean; className?: string }) {
  const { t } = useT();
  const c = t.company2;
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const r = await researchCompany(slug, researched);
      if (r.ok) toast.success(c.researchOk, r.engine ? `${t.common.engine}: ${r.engine === "heuristic" ? t.common.heuristic : r.engine}` : undefined);
      else toast.error(c.researchFail, r.error === "no website" ? c.noWebsite : r.error);
      router.refresh();
    });
  return (
    <button type="button" className={className} onClick={run} disabled={pending} aria-busy={pending}>
      {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : researched ? <RefreshCw size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
      {pending ? c.researching : researched ? c.refresh : c.research}
    </button>
  );
}

export function ResearchTopButton({ n, remaining }: { n: number; remaining: number }) {
  const { t } = useT();
  const c = t.company2;
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const count = Math.min(n, remaining);
  const run = () =>
    start(async () => {
      const r = await researchTop(count);
      toast[r.failed && !r.done ? "error" : "success"](fmt(c.researchTopDone, { n: r.done }), r.failed ? `${r.failed} ${c.researchFail.toLowerCase()}` : undefined);
      router.refresh();
    });
  return (
    <button type="button" className="btn btn-saffron" onClick={run} disabled={pending || !count} aria-busy={pending}>
      {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" className="text-accent-text" />}
      {pending ? c.researching : fmt(c.researchTop, { n: count })}
    </button>
  );
}
