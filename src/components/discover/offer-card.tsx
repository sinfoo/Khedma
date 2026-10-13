"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bookmark, Check, Loader2, Sparkles } from "lucide-react";
import { CompanyAvatar } from "@/components/kit";
import { useToast } from "@/components/kit/toast";
import { ScoreRing, scoreLabel } from "@/components/ui";
import { PostingLink } from "@/components/posting-link";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import type { OfferReco } from "@/lib/recommend/engine";
import { evaluateRecommended, trackRecommended } from "@/app/actions/discover";
import { reasonText } from "./text";
import { WhyPopover } from "./why-popover";

export function OfferCard({ offer, i }: { offer: OfferReco; i: number }) {
  const { t, locale } = useT();
  const m = t.discover2;
  const toast = useToast();
  const [tracked, setTracked] = useState(offer.tracked);
  const [evaluation, setEvaluation] = useState(offer.evaluation);
  const [trackPending, startTrack] = useTransition();
  const [evalPending, startEval] = useTransition();
  const reasons = offer.reasons.map((r) => reasonText(t, r));
  const deadline = offer.deadline ? new Date(offer.deadline) : null;

  return (
    <li className="card card-hover rise flex flex-col gap-3 p-4" style={{ ["--i" as string]: i }}>
      <div className="flex items-start gap-3">
        <CompanyAvatar name={offer.company} size={40} />
        <div className="min-w-0 flex-1">
          <Link href={`/app/jobs/${offer.id}`} className="block truncate font-medium hover:text-accent-text">
            {offer.title}
          </Link>
          <p className="truncate text-xs text-muted">
            {offer.company}
            {offer.location && ` · ${offer.location}`}
            {offer.remote && ` · ${t.common.remote}`}
          </p>
        </div>
        {evaluation ? (
          <ScoreRing value={evaluation.global} size={40} label={scoreLabel(t, evaluation.global)} animate={false} />
        ) : (
          <span
            className="mono tabular shrink-0 rounded-lg bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-text"
            role="img"
            aria-label={fmt(m.fitLabel, { n: offer.score })}
          >
            {offer.score}%
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="chip">{t.jobTypes[offer.type]}</span>
        {evaluation && <span className="chip chip-accent">{fmt(m.fit, { n: offer.score })}</span>}
        {deadline && !Number.isNaN(deadline.getTime()) && (
          <span className="chip">{t.common.deadline}: {deadline.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short" })}</span>
        )}
      </div>

      {reasons.length > 0 && (
        <ul className="space-y-1 text-sm text-ink-2">
          {reasons.slice(0, 2).map((r) => (
            <li key={r} className="flex gap-2">
              <Check size={14} aria-hidden="true" className="mt-[3px] shrink-0 text-success" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <PostingLink job={{ url: offer.url, title: offer.title, company: offer.company, location: offer.location }} variant="ghost" />
        {tracked ? (
          <span className="chip chip-success"><Check size={12} aria-hidden="true" /> {m.offer.tracked}</span>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
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
            {trackPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Bookmark size={14} aria-hidden="true" />}
            {m.offer.track}
          </button>
        )}
        {!evaluation && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={evalPending}
            aria-busy={evalPending}
            aria-label={`${m.offer.evaluate}: ${offer.title}`}
            onClick={() =>
              startEval(async () => {
                const r = await evaluateRecommended(offer.id);
                if (r.ok && r.global !== undefined && r.verdict && r.engine) {
                  setEvaluation({ global: r.global, verdict: r.verdict, engine: r.engine });
                  toast.success(fmt(m.offer.evaluated, { score: r.global.toFixed(1) }));
                } else toast.error(t.common.error);
              })
            }
          >
            {evalPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
            {evalPending ? m.offer.evaluating : m.offer.evaluate}
          </button>
        )}
        <WhyPopover label={m.why} title={offer.title} items={reasons} />
      </div>
    </li>
  );
}
