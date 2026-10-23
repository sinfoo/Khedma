"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Radar } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { adaptToCv } from "@/app/actions/profile";
import { useScan, type ScanOutcome } from "@/components/sources/use-scan";

type Adapted = Awaited<ReturnType<typeof adaptToCv>>;

/**
 * The phase after a new or replaced CV: profile (skills, target roles) and offer ranking follow the CV, then the
 * sources are scanned with the CV's keywords. The scan runs on the server: leaving the page does not stop it,
 * and the radar page picks it up.
 */
export function CvAdapt() {
  const { t } = useT();
  const c = t.profile2.cv;
  const { start, attach, running, total, finished, jobs } = useScan();
  const [adapted, setAdapted] = useState<Adapted | null>(null);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [failed, setFailed] = useState(false);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    adaptToCv()
      .then(async (a) => {
        setAdapted(a);
        const r = await start({ keywords: a.keywords });
        setOutcome(r.kind === "busy" ? ((await attach()) ?? r) : r);
      })
      .catch(() => setFailed(true));
  }, [start, attach]);

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
          {step(!!outcome, scanText)}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {!outcome && adapted && (
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
