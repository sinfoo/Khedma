"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CircleDashed, Download, Globe, Loader2, ShieldAlert } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { daysUntil, fmtDate } from "@/components/ui";
import type { ApplySafety } from "@/lib/apply/types";
import { checkPostingAlive } from "@/app/actions/apply";

export interface Ready {
  evaluated: boolean;
  cv: boolean;
  letter: boolean;
  contact: string | null;
  deadline: string | null;
  manual: boolean;
  hasProfileCv: boolean;
  savedAnswers: number;
}

export function Readiness({ id, jobId, ready, safety, company }: { id: number; jobId: number; ready: Ready; safety: ApplySafety; company: string }) {
  const { t, locale } = useT();
  const r = t.apply2.ready;
  const sf = t.apply2.safety;
  const gateLabel = t.offers2.v2.gateKeys;
  const [live, setLive] = useState<{ alive: boolean | null; status: number } | null>(null);
  const [pending, start] = useTransition();
  const days = daysUntil(ready.deadline);
  const deadlineOk = !!ready.deadline && days !== null && days >= 0;
  const pipe = `/app/pipeline/${id}`;

  const items: { key: keyof typeof r.items; ok: boolean; hint: string; href?: string }[] = [
    { key: "evaluated", ok: ready.evaluated, hint: r.hints.evaluated, href: `/app/jobs/${jobId}` },
    { key: "cv", ok: ready.cv, hint: r.hints.cv, href: `${pipe}?tab=documents&doc=cv` },
    { key: "letter", ok: ready.letter, hint: r.hints.letter, href: `${pipe}?tab=documents&doc=letter` },
    { key: "contact", ok: !!ready.contact, hint: ready.contact ?? r.hints.contact, href: `${pipe}?tab=contacts` },
    {
      key: "deadline",
      ok: deadlineOk,
      hint: !ready.deadline ? r.hints.deadline : days! < 0 ? fmt(r.hints.deadlinePast, { d: fmtDate(ready.deadline, locale) }) : fmt(r.hints.deadlineIn, { n: days!, d: fmtDate(ready.deadline, locale) }),
      href: `/app/jobs/${jobId}/edit`,
    },
    { key: "liveness", ok: ready.manual || live?.alive === true, hint: ready.manual ? r.hints.livenessNa : live ? (live.alive === null ? t.common.unknown : live.alive ? r.online : fmt(r.offline, { s: live.status })) : r.hints.liveness },
  ];
  const done = items.filter((i) => i.ok).length;

  const koText = (k: ApplySafety["knockouts"][number]) =>
    k.key === "gate" && k.gate ? fmt(sf.gate, { label: fmt(gateLabel[k.gate.key], { lang: k.gate.lang ?? "" }) }) : fmt(sf[k.key === "gate" ? "visa" : k.key], k.vars);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
      <section className={`card p-5 rise ${safety.knockouts.some((k) => k.level === "danger") ? "border-danger/40" : ""}`} aria-labelledby="ko-h">
        <h2 id="ko-h" className="flex items-center gap-2 text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
          <ShieldAlert size={16} className={safety.knockouts.length ? "text-danger" : "text-muted"} aria-hidden="true" /> {sf.knockouts}
        </h2>
        <p className="text-sm text-muted">{sf.knockoutsHint}</p>
        {safety.knockouts.length === 0 && safety.repeat.n === 0 ? (
          <p className="mt-3 text-sm text-success">{sf.none}</p>
        ) : (
          <ul className="mt-3 space-y-2.5" aria-live="polite">
            {safety.knockouts.map((k, i) => (
              <li key={`${k.key}-${i}`} className="flex items-start gap-3 rise" style={{ ["--i" as string]: i }}>
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
      </section>
      <section className="card p-5 rise" aria-labelledby="ready-h">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="ready-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{r.title}</h2>
            <p className="text-sm text-muted">{r.lead}</p>
          </div>
          <span className={`chip ${done === items.length ? "chip-success" : "chip-saffron"} tabular`} aria-live="polite">{fmt(r.score, { n: done, total: items.length })}</span>
        </div>
        <ul className="divide-y divide-line">
          {items.map((it, i) => (
            <li key={it.key} className="flex items-center gap-3 py-3 rise" style={{ ["--i" as string]: i }}>
              <span className={`grid size-7 shrink-0 place-items-center rounded-full ${it.ok ? "bg-success-soft text-success" : "bg-surface-2 text-muted"}`} aria-hidden="true">
                {it.ok ? <Check size={15} /> : <CircleDashed size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  <span className="sr-only">{it.ok ? t.common.yes : t.common.no}: </span>
                  {r.items[it.key]}
                </p>
                <p className="truncate text-xs text-muted">{it.hint}</p>
              </div>
              {it.key === "liveness" && !ready.manual ? (
                <button type="button" className="btn btn-secondary btn-sm" disabled={pending} aria-busy={pending} onClick={() => start(async () => { const res = await checkPostingAlive(id); if (res.ok) setLive({ alive: res.alive, status: res.status }); })}>
                  {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Globe size={14} aria-hidden="true" />}
                  {live ? r.checked : r.checkLink}
                </button>
              ) : (
                !it.ok && it.href && <Link href={it.href} className="btn btn-secondary btn-sm">{r.fix}</Link>
              )}
            </li>
          ))}
        </ul>
      </section>
      </div>

      <aside className="card p-5 rise" style={{ ["--i" as string]: 2 }} aria-labelledby="pack-h">
        <h2 id="pack-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{r.pack}</h2>
        <p className="mb-4 text-sm text-muted">{r.packHint}</p>
        <dl className="space-y-3 text-sm">
          <PackRow label={r.packCv} value={ready.cv ? r.packCvTailored : ready.hasProfileCv ? r.packCvProfile : r.packCvNone} ok={ready.cv || ready.hasProfileCv} download={ready.cv ? `/api/applications/${id}/export?doc=cv&format=docx` : undefined} dl={r.download} />
          <PackRow label={r.packLetter} value={ready.letter ? t.common.yes : r.packLetterNone} ok={ready.letter} download={ready.letter ? `/api/applications/${id}/export?doc=letter&format=docx` : undefined} dl={r.download} />
          <PackRow label={r.packAnswers} value={fmt(r.packAnswersN, { n: ready.savedAnswers })} ok={ready.savedAnswers > 0} />
          <PackRow label={r.packContact} value={ready.contact ?? t.common.none} ok={!!ready.contact} />
        </dl>
      </aside>
    </div>
  );
}

function PackRow({ label, value, ok, download, dl }: { label: string; value: string; ok: boolean; download?: string; dl?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
        <dd className={`truncate ${ok ? "" : "text-muted"}`}>{value}</dd>
      </div>
      {download && (
        <a href={download} className="btn btn-ghost btn-sm shrink-0" aria-label={`${dl} — ${label}`}>
          <Download size={14} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
