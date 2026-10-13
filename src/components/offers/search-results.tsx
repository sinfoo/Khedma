"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, Bookmark, Check, Flame, Loader2, Sparkles, UserSearch } from "lucide-react";
import { CompanyAvatar, Progress } from "@/components/kit";
import { useToast } from "@/components/kit/toast";
import { PostingLink } from "@/components/posting-link";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { contactSearchUrl } from "@/lib/links";
import { countryName } from "@/lib/geo";
import type { FoundJob } from "@/components/sources/use-scan";
import type { JobType } from "@/lib/types";
import { evaluateOffer, trackOffers } from "@/app/actions/jobs";

const SUSPICIOUS = 60;
const URGENT_DAYS = 7;

/** Live list of the offers kept by the running search, best first; suspicious postings sink to the bottom. */
export function SearchResults({ jobs, running }: { jobs: FoundJob[]; running: boolean }) {
  const { t } = useT();
  const m = t.offers2.results;
  // One clock reading per mount: deadline chips must not change between renders.
  const [now] = useState(() => Date.now());
  const sorted = [...jobs].sort((a, b) => Number(a.trust < SUSPICIOUS) - Number(b.trust < SUSPICIOUS) || b.relevance - a.relevance || a.id - b.id);
  return (
    <section className="mt-4" aria-labelledby="results-h" aria-live="polite" aria-busy={running}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="results-h" className="text-sm font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
          {m.title} <span className="tabular text-muted">· {fmt(m.live, { n: jobs.length })}</span>
        </h3>
        <p className="text-xs text-muted">{m.sortNote}</p>
      </div>
      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-muted">{m.empty}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {sorted.map((j, i) => (
            <ResultCard key={j.id} job={j} i={Math.min(i, 8)} now={now} />
          ))}
        </ul>
      )}
      {jobs.length > 0 && !running && (
        <p className="mt-3 text-right">
          <Link href="/app/jobs?sort=newest" className="text-sm font-semibold text-accent-text hover:underline">
            {m.all} →
          </Link>
        </p>
      )}
    </section>
  );
}

function whyText(t: ReturnType<typeof useT>["t"], locale: string, code: string): string {
  const w = t.offers2.results.why;
  const i = code.indexOf(":");
  const k = i >= 0 ? code.slice(0, i) : code;
  const v = i >= 0 ? code.slice(i + 1) : "";
  switch (k) {
    case "title": return fmt(w.title, { v: v.replace(/,/g, ", ") });
    case "type": return t.jobTypes[v as JobType] ?? v;
    case "place": return countryName(v, locale === "fr" ? "fr" : "en");
    case "desc": return fmt(w.desc, { v });
    case "fresh": return v === "0" ? w.freshToday : fmt(w.fresh, { v });
    case "remote": return w.remote;
    case "company": return w.company;
    case "junior": return w.junior;
    case "dup": return w.dup;
    case "tier": return w.tier;
    default: return code;
  }
}

function ResultCard({ job, i, now }: { job: FoundJob; i: number; now: number }) {
  const { t, locale } = useT();
  const m = t.offers2.results;
  const toast = useToast();
  const [tracked, setTracked] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [trackPending, startTrack] = useTransition();
  const [evalPending, startEval] = useTransition();
  const suspicious = job.trust < SUSPICIOUS;
  const why = job.why.slice(0, 4);
  const daysLeft = job.deadline ? Math.ceil((new Date(job.deadline).getTime() - now) / 86_400_000) : null;
  const urgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= URGENT_DAYS;

  return (
    <li className={`card rise flex flex-col gap-2.5 p-3.5 ${suspicious ? "opacity-80" : ""}`} style={{ ["--i" as string]: i }}>
      <div className="flex items-start gap-3">
        <CompanyAvatar name={job.company} size={36} />
        <div className="min-w-0 flex-1">
          <Link href={`/app/jobs/${job.id}`} className="block truncate font-medium hover:text-accent-text">
            {job.title}
          </Link>
          <p className="truncate text-xs text-muted">
            {job.company}
            {job.location && ` · ${job.location}`}
            {job.remote && ` · ${t.common.remote}`}
            {" · "}
            {m.host[job.host]}
          </p>
        </div>
        <span className="mono tabular shrink-0 rounded-lg bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-text" role="img" aria-label={fmt(m.relevance, { n: job.relevance })}>
          {job.relevance}
        </span>
      </div>
      <Progress value={job.relevance} label={fmt(m.relevance, { n: job.relevance })} tone={job.relevance >= 70 ? "success" : job.relevance >= 40 ? "accent" : "saffron"} />
      <div className="flex flex-wrap items-center gap-1">
        <span className="chip !py-0 text-[0.72rem]">{t.jobTypes[job.type as JobType] ?? job.type}</span>
        {urgent && (
          <span className="chip chip-saffron !py-0 text-[0.72rem]">
            <Flame size={11} aria-hidden="true" /> {daysLeft === 0 ? m.urgentToday : fmt(m.urgent, { n: daysLeft })}
          </span>
        )}
        {job.appliedHere && <span className="chip chip-saffron !py-0 text-[0.72rem]">{fmt(m.appliedHere, { c: job.company })}</span>}
        {suspicious && (
          <span className="chip chip-danger !py-0 text-[0.72rem]" title={job.trustFlags.map((f) => m.flags[f as keyof typeof m.flags] ?? f).join(", ")}>
            <AlertTriangle size={11} aria-hidden="true" /> {m.suspicious} · {fmt(m.trust, { n: job.trust })}
          </span>
        )}
        {score !== null && <span className="chip chip-success !py-0 text-[0.72rem]">{fmt(m.evaluated, { s: score.toFixed(1) })}</span>}
        {why.map((w) => (
          <span key={w} className="chip !py-0 text-[0.72rem] text-ink-2">
            {whyText(t, locale, w)}
          </span>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <PostingLink job={{ url: job.url, title: job.title, company: job.company, location: job.location, source: job.source }} variant="ghost" iconOnly />
        <a href={contactSearchUrl(job.company)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm btn-icon" title={m.contact} aria-label={`${m.contact}: ${job.company}`}>
          <UserSearch size={14} aria-hidden="true" />
        </a>
        {tracked ? (
          <span className="chip chip-success">
            <Check size={12} aria-hidden="true" /> {m.tracked}
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={trackPending}
            aria-busy={trackPending}
            aria-label={`${m.track}: ${job.title}`}
            onClick={() =>
              startTrack(async () => {
                const n = await trackOffers([job.id]);
                if (n) setTracked(true);
                else toast.error(t.common.error);
              })
            }
          >
            {trackPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Bookmark size={14} aria-hidden="true" />}
            {m.track}
          </button>
        )}
        {score === null && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={evalPending}
            aria-busy={evalPending}
            aria-label={`${m.evaluate}: ${job.title}`}
            onClick={() =>
              startEval(async () => {
                const r = await evaluateOffer(job.id);
                if (r.ok && r.global !== undefined) setScore(r.global);
                else toast.error(t.common.error);
              })
            }
          >
            {evalPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
            {evalPending ? m.evaluating : m.evaluate}
          </button>
        )}
      </div>
    </li>
  );
}
