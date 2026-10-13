"use client";

import { useState } from "react";
import { Check, Copy, Link2, Loader2, Mail, MailCheck, Sparkles, UserRound } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { EngineChip } from "@/components/ui";
import { useRun } from "@/components/pipeline/use-run";
import { draftOutreach, logOutreach } from "@/app/actions/apply";

type Kind = "recruiter" | "linkedin";
const LINKEDIN_MAX = 300;

export function OutreachStep({ id, contacts }: { id: number; contacts: { id: number; name: string; email: string }[] }) {
  const { t } = useT();
  const o = t.apply2.outreach;
  const [contactId, setContactId] = useState<number | null>(contacts[0]?.id ?? null);
  const contact = contacts.find((c) => c.id === contactId);
  return (
    <div className="space-y-5">
      <section className="card p-5 rise" aria-labelledby="out-h">
        <h2 id="out-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{o.title}</h2>
        <p className="mb-4 text-sm text-muted">{o.lead}</p>
        <div className="max-w-sm">
          <label className="label" htmlFor="out-contact">{o.contact}</label>
          <select id="out-contact" className="input" value={contactId ?? ""} onChange={(e) => setContactId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{o.noContact}</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ""}</option>)}
          </select>
        </div>
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Draft id={id} kind="recruiter" contactId={contactId} email={contact?.email ?? ""} i={1} />
        <Draft id={id} kind="linkedin" contactId={contactId} email="" i={2} />
      </div>
    </div>
  );
}

function Draft({ id, kind, contactId, email, i }: { id: number; kind: Kind; contactId: number | null; email: string; i: number }) {
  const { t } = useT();
  const o = t.apply2.outreach;
  const [draft, setDraft] = useState<{ subject: string; body: string; engine: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [gen, runGen] = useRun();
  const [logging, runLog] = useRun();
  const body = draft?.body ?? "";
  const over = kind === "linkedin" && body.length > LINKEDIN_MAX;
  const tid = `out-${kind}`;
  return (
    <section className="card p-5 rise" style={{ ["--i" as string]: i }} aria-labelledby={`${tid}-h`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${tid}-h`} className="flex items-center gap-2 text-sm font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
          {kind === "recruiter" ? <UserRound size={15} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}{kind === "recruiter" ? o.recruiter : o.linkedin}
        </h3>
        <button type="button" className="btn btn-primary btn-sm" disabled={gen} aria-busy={gen} onClick={() => runGen(() => draftOutreach(id, kind, contactId), undefined, (r) => setDraft({ subject: r.subject, body: r.body, engine: r.engine }))}>
          {gen ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}{gen ? t.common.generating : draft ? t.common.regenerate : o.generate}
        </button>
      </div>
      <div aria-live="polite">
        {!draft ? (
          gen ? <div className="space-y-2" aria-hidden="true">{[80, 95, 60].map((w, k) => <div key={k} className="skeleton h-4" style={{ width: `${w}%` }} />)}</div>
            : <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{o.empty}</p>
        ) : (
          <div className="space-y-3">
            <EngineChip engine={draft.engine} t={t} />
            {draft.subject && <p className="text-sm font-medium">{draft.subject}</p>}
            <label className="sr-only" htmlFor={tid}>{kind === "recruiter" ? o.recruiter : o.linkedin}</label>
            <textarea id={tid} className="input min-h-36 w-full resize-y text-sm leading-relaxed" value={body} aria-invalid={over || undefined} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            {kind === "linkedin" && <p className={`text-xs tabular ${over ? "text-danger" : "text-muted"}`}>{body.length} / {LINKEDIN_MAX}</p>}
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? t.common.copied : t.common.copy}
              </button>
              {kind === "recruiter" && (
                <a className="btn btn-secondary btn-sm" href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(body)}`}>
                  <Mail size={14} aria-hidden="true" />{o.emailIt}
                </a>
              )}
              <button type="button" className="btn btn-ghost btn-sm" disabled={logging || !body.trim()} aria-busy={logging} onClick={() => runLog(() => logOutreach(id, kind, body), o.logged)}>
                <MailCheck size={14} aria-hidden="true" />{o.logSent}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
