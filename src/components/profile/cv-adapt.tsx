"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Radar } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { adaptToCv } from "@/app/actions/profile";
import { getAutoScanState } from "@/app/actions/sources";
import { useScan, type ScanOutcome } from "@/components/sources/use-scan";

type Adapted = Awaited<ReturnType<typeof adaptToCv>>;

/**
 * The phase after a new or replaced CV: profile (skills, target roles) and offer ranking follow the CV. The first
 * CV also scans the sources with its keywords; a replaced CV (a typo fixed) only offers "Scan with this CV", since a
 * scan is minutes of requests to outside sites. The scan runs on the server: leaving the page does not stop it.
 */
export function CvAdapt() {
  const { t } = useT();
  const c = t.profile2.cv;
  const { start, attach, running, total, finished, jobs } = useScan();
  const [adapted, setAdapted] = useState<Adapted | null>(null);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [asked, setAsked] = useState(false);
  const [failed, setFailed] = useState(false);
  const once = useRef(false);

  const scan = async (keywords: string[]) => {
    setAsked(true);
    const r = await start({ keywords });
    setOutcome(r.kind === "busy" ? ((await attach()) ?? r) : r);
  };

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    Promise.all([adaptToCv(), getAutoScanState()])
      .then(async ([a, s]) => {
        setAdapted(a);
        // No scan ever ran: this is the first CV, so the first scan starts on its own.
        if (!s.lastRunAt) await scan(a.keywords);
      })
      .catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = (done: boolean, text: string) => (
    <li className="flex items-start gap-2">
      {done ? <Check size={15} className="mt-0.5 shrink-0 text-success" aria-hidden="true" /> : <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-muted" aria-hidden="true" />}
      <span>{text}</span>
    </li>
  );
  const scanText = !adapted
    ? c.adaptScanWait
    : outcome?.kind === "done"
      ? fmt(c.adaptDone, { n: outcome.done.added })
      : outcome?.kind === "skipped" || outcome?.kind === "cancelled"
        ? c.adaptScanSkipped
        : outcome?.kind === "error"
          ? c.adaptScanFailed
          : running && total
            ? fmt(c.adaptScanProgress, { done: finished, total, kept: jobs.length })
            : fmt(c.adaptScan, { kw: adapted.keywords.join(", ") });

  return (
    <section className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm" aria-labelledby="cv-adapt-h">
      <h3 id="cv-adapt-h" className="font-semibold">{c.adaptTitle}</h3>
      {failed ? (
        <p className="mt-1 text-danger" role="alert">{c.adaptFailed}</p>
      ) : (
        <ul className="mt-2 space-y-1.5" role="status">
          {step(!!adapted, adapted ? (adapted.roles.length ? fmt(c.adaptProfile, { roles: adapted.roles.join(", "), n: adapted.skillsAdded }) : fmt(c.adaptProfileNone, { n: adapted.skillsAdded })) : c.adaptReading)}
          {adapted && step(true, fmt(c.adaptRerank, { n: adapted.reranked }))}
          {(asked || !adapted) && step(!!outcome, scanText)}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {adapted && !asked && (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void scan(adapted.keywords)}>
              <Radar size={14} aria-hidden="true" /> {c.adaptScanCta}
            </button>
            <span className="text-muted">{fmt(c.adaptScanOffer, { kw: adapted.keywords.join(", ") })}</span>
          </>
        )}
        {asked && !outcome && (
          <Link href="/app/sources" className="btn btn-outline btn-sm">
            <Radar size={14} aria-hidden="true" /> {c.adaptSeeRadar}
          </Link>
        )}
        {outcome?.kind === "done" && (
          <Link href="/app/jobs" className="btn btn-primary btn-sm">{c.adaptSeeOffers}</Link>
        )}
      </div>
    </section>
  );
}
