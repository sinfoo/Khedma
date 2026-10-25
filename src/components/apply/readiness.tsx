"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Globe, Lightbulb, Loader2, ShieldAlert } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { fmtDate } from "@/components/ui";
import type { ApplySafety } from "@/lib/apply/types";
import { checkPostingAlive } from "@/app/actions/apply";

const ATS_NAME = { ashby: "Ashby", lever: "Lever", workday: "Workday", successfactors: "SuccessFactors", greenhouse: "Greenhouse", workable: "Workable", smartrecruiters: "SmartRecruiters" } as const;

/** Before sending: knock-out criteria quoted from the posting, a repeat-application warning, "is it still online?" and ATS tips. */
export function SafetyCard({ id, safety, company, manual, checked = null }: { id: number; safety: ApplySafety; company: string; manual: boolean; /** Last saved liveness check of this posting, if recent. */ checked?: { alive: boolean | null; status: number } | null }) {
  const { t, locale } = useT();
  const r = t.apply2.ready;
  const sf = t.apply2.safety;
  const gateLabel = t.offers2.v2.gateKeys;
  const [live, setLive] = useState<{ alive: boolean | null; status: number } | null>(checked);
  const [pending, start] = useTransition();
  const check = () => start(async () => { const res = await checkPostingAlive(id); if (res.ok) setLive({ alive: res.alive, status: res.status }); });
  // Opening the review step checks the posting once: nobody should write a letter for a closed offer.
  useEffect(() => {
    if (!manual && !checked) check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const danger = safety.knockouts.some((k) => k.level === "danger");

  const koText = (k: ApplySafety["knockouts"][number]) =>
    k.key === "gate" && k.gate ? fmt(sf.gate, { label: fmt(gateLabel[k.gate.key], { lang: k.gate.lang ?? "" }) }) : fmt(sf[k.key === "gate" ? "visa" : k.key], k.vars);

  return (
    <section className={`card p-[18px] ${danger ? "border-danger/40" : ""}`} aria-labelledby="ko-h">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="ko-h" className="flex items-center gap-2 text-[1.15rem] tracking-[-0.01em]">
            <ShieldAlert size={16} className={safety.knockouts.length ? "text-danger" : "text-muted"} aria-hidden="true" /> {sf.knockouts}
          </h2>
          <p className="text-[0.82rem] text-muted">{sf.knockoutsHint}</p>
        </div>
        {!manual && (
          <button type="button" className={`btn btn-outline btn-sm ${live?.alive === false ? "!border-danger/50 text-danger" : ""}`} disabled={pending} aria-busy={pending} onClick={check} title={r.checkLink}>
            {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Globe size={14} aria-hidden="true" />}
            {pending ? r.checking : live ? (live.alive === null ? r.unknownLive : live.alive ? r.online : r.offline) : r.checkLink}
          </button>
        )}
      </div>
      {safety.knockouts.length === 0 && safety.repeat.n === 0 ? (
        <p className="mt-3 text-sm text-success">{sf.none}</p>
      ) : (
        <ul className="mt-3 space-y-2.5" aria-live="polite">
          {safety.knockouts.map((k, i) => (
            <li key={`${k.key}-${i}`} className="flex items-start gap-3">
              <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${k.level === "danger" ? "text-danger" : "text-saffron"}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{koText(k)}</p>
                <q className="text-xs text-muted">{k.quote}</q>
              </div>
            </li>
          ))}
          {safety.repeat.n > 0 && (
            <li className="flex items-start gap-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-saffron" aria-hidden="true" />
              <p className="text-sm">{fmt(sf.repeat, { company, n: safety.repeat.n, d: fmtDate(safety.repeat.last, locale) })}</p>
            </li>
          )}
        </ul>
      )}
      {safety.ats && (
        <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-surface-2 px-3 py-2.5 text-[0.8rem] leading-relaxed text-ink-2">
          <Lightbulb size={14} className="mt-0.5 shrink-0 text-saffron" aria-hidden="true" />
          <span>
            <strong>{fmt(sf.tipsFor, { ats: ATS_NAME[safety.ats] })}</strong> · {sf.tip[safety.ats]}
          </span>
        </p>
      )}
    </section>
  );
}
