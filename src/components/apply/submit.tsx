"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { fmtDate } from "@/components/ui";
import { useRun } from "@/components/pipeline/use-run";
import { CHANNELS, type Channel, type Pack } from "@/lib/apply/types";
import type { JobType } from "@/lib/types";
import { submitApplication } from "@/app/actions/apply";

export function SubmitStep({
  id, job, pack, answersCount, profile, contactEmail, hasLetter,
}: {
  id: number;
  job: { title: string; company: string; type: JobType };
  pack: Pack;
  answersCount: number;
  profile: { name: string };
  contactEmail: string;
  hasLetter: boolean;
}) {
  const { t, locale } = useT();
  const s = t.apply2.submit;
  const [channel, setChannel] = useState<Channel>(pack.channel ?? "site");
  const [reference, setReference] = useState(pack.reference);
  const [done, setDone] = useState<{ at: string; channel: Channel; due: string | null } | null>(pack.submitted_at ? { at: pack.submitted_at, channel: pack.channel ?? "site", due: null } : null);
  const [pending, run] = useRun();
  const kind = t.jobTypes[job.type].toLowerCase();
  const mailto = `mailto:${encodeURIComponent(contactEmail)}?subject=${encodeURIComponent(fmt(s.mailSubject, { title: job.title }))}&body=${encodeURIComponent(fmt(s.mailBody, { title: job.title, kind, company: job.company, name: profile.name || "" }))}`;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
      <section className="card p-5 rise" aria-labelledby="sub-h">
        <h2 id="sub-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{s.title}</h2>
        <p className="mb-4 text-sm text-muted">{s.lead}</p>
        {done && (
          <div className="mb-4 flex items-start gap-3 rounded-xl bg-success-soft p-3 text-sm" role="status">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            <div>
              <p className="font-medium">{fmt(s.done, { d: fmtDate(done.at, locale), channel: s.channels[done.channel] })}</p>
              {pack.reference && <p className="text-muted">{fmt(s.ref, { r: pack.reference })}</p>}
              {pack.answers.length > 0 && <p className="text-muted">{fmt(s.answersStored, { n: pack.answers.length })}</p>}
              {done.due && <p className="text-muted">{fmt(s.followup, { d: fmtDate(done.due, locale) })}</p>}
              <Link href={`/app/pipeline/${id}`} className="mt-1 inline-block text-accent-text underline-offset-2 hover:underline">{s.openPipeline}</Link>
            </div>
          </div>
        )}
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => submitApplication(id, channel, reference), s.applied, (r) => setDone({ at: new Date().toISOString(), channel, due: r.followupDue })); }}>
          <fieldset>
            <legend className="label">{s.channel}</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {CHANNELS.map((c) => (
                <label key={c} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)] has-[:focus-visible]:[outline-style:solid] ${channel === c ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"}`}>
                  <input type="radio" name="channel" value={c} checked={channel === c} onChange={() => setChannel(c)} className="size-4 accent-[var(--accent)]" />
                  {s.channels[c]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="max-w-sm">
            <label className="label" htmlFor="sub-ref">{s.reference}</label>
            <input id="sub-ref" className="input" value={reference} placeholder={s.referencePlaceholder} maxLength={120} onChange={(e) => setReference(e.target.value)} />
          </div>
          <p className="text-sm text-muted">{answersCount ? fmt(s.snapshot, { n: answersCount }) : s.snapshotNone}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
              {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}{s.apply}
            </button>
            {channel === "email" && <a href={mailto} className="btn btn-secondary"><Mail size={16} aria-hidden="true" />{s.mailto}</a>}
          </div>
        </form>
      </section>

      {channel === "email" && (
        <aside className="card p-5 rise" style={{ ["--i" as string]: 1 }} aria-labelledby="att-h">
          <h2 id="att-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{s.attachments}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex gap-2"><span aria-hidden="true">📎</span>{s.attachCv}</li>
            <li className={`flex gap-2 ${hasLetter ? "" : "text-muted"}`}><span aria-hidden="true">📎</span>{s.attachLetter}</li>
            <li className="flex gap-2 text-muted"><span aria-hidden="true">📎</span>{s.attachTranscript}</li>
          </ul>
        </aside>
      )}
    </div>
  );
}
