"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bookmark, Check, Loader2, Send, Sparkles } from "lucide-react";
import { useToast } from "@/components/kit/toast";
import { ScoreRing, scoreLabel } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import type { OfferReco } from "@/lib/recommend/engine";
import { evaluateRecommended, trackRecommended } from "@/app/actions/discover";
import { applyTo } from "@/app/actions/jobs";
import { reasonText } from "./text";
import { WhyPopover } from "./why-popover";

/** One recommended offer: fit ring, why it fits, Track / Why? */
export function OfferCard({ offer, i }: { offer: OfferReco; i: number }) {
  const { t } = useT();
  const m = t.discover2;
  const toast = useToast();
  const [tracked, setTracked] = useState(offer.tracked);
  const [evaluation, setEvaluation] = useState(offer.evaluation);
  const [trackPending, startTrack] = useTransition();
  const [evalPending, startEval] = useTransition();
  const [applying, startApply] = useTransition();
  const reasons = offer.reasons.map((r) => reasonText(t, r));
  const r = 22;
  const c = 2 * Math.PI * r;

  return (
    <li className="card grid grid-cols-[auto_1fr] items-center gap-3.5 px-4 py-3.5 sm:grid-cols-[auto_1fr_auto] rise" style={{ ["--i" as string]: Math.min(i, 8) }}>
      {evaluation ? (
        <ScoreRing dec={t.a11y.decimal} value={evaluation.global} size={52} label={scoreLabel(t, evaluation.global)} animate={false} />
      ) : (
        <span role="img" aria-label={fmt(m.fitLabel, { n: offer.score })} className="relative grid size-[52px] place-items-center">
          <svg viewBox="0 0 52 52" width="52" height="52" className="-rotate-90" aria-hidden="true">
            <circle cx="26" cy="26" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="5" />
            <circle cx="26" cy="26" r={r} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(c * offer.score) / 100} ${c}`} style={{ transition: "stroke-dasharray 1s cubic-bezier(.2,.7,.2,1)" }} />
          </svg>
          <span className="mono absolute text-[0.75rem] font-semibold">{offer.score}%</span>
        </span>
      )}
      <div className="min-w-0">
        <Link href={`/app/jobs/${offer.id}`} className="block truncate text-[0.95rem] font-semibold text-ink hover:text-accent-text">
          {offer.title}
        </Link>
        <p className="mt-px truncate text-[0.78rem] text-muted">
          {offer.company}
          {offer.location && ` · ${offer.location}`}
          {offer.remote && ` · ${t.common.remote}`} · {t.jobTypes[offer.type]}
        </p>
        {reasons.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-1.5">
            {reasons.slice(0, 2).map((x) => (
              <span key={x} className="chip chip-success max-w-full !whitespace-normal !py-px text-[0.72rem]">
                <Check size={10} aria-hidden="true" /> {x}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-3">
        <button type="button" className="btn btn-primary btn-sm" disabled={applying} aria-busy={applying} aria-label={`${t.offers2.apply}: ${offer.title}`} onClick={() => startApply(async () => await applyTo(offer.id))}>
          {applying ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Send size={13} aria-hidden="true" />} {t.offers2.apply}
        </button>
        {tracked ? (
          <span className="chip chip-success"><Check size={12} aria-hidden="true" /> {m.offer.tracked}</span>
        ) : (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={trackPending}
            aria-busy={trackPending}
            aria-label={`${m.offer.track}: ${offer.title}`}
            onClick={() =>
              startTrack(async () => {
                const id = await trackRecommended(offer.id);
                if (id) {
                  setTracked(true);
                  toast.success(m.offer.tracked, m.offer.trackedBody);
                } else toast.error(t.common.error);
              })
            }
          >
            {trackPending ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Bookmark size={13} aria-hidden="true" />}
            {m.offer.track}
          </button>
        )}
        {!evaluation && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={evalPending}
            aria-busy={evalPending}
            aria-label={`${m.offer.evaluate}: ${offer.title}`}
            onClick={() =>
              startEval(async () => {
                const x = await evaluateRecommended(offer.id);
                if (x.ok && x.global !== undefined && x.verdict && x.engine) {
                  setEvaluation({ global: x.global, verdict: x.verdict, engine: x.engine });
                  toast.success(fmt(m.offer.evaluated, { score: x.global.toFixed(1) }));
                } else toast.error(t.common.error);
              })
            }
          >
            {evalPending ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />}
            {evalPending ? m.offer.evaluating : m.offer.evaluate}
          </button>
        )}
        <WhyPopover label={m.why} title={offer.title} items={reasons} />
      </div>
    </li>
  );
}
