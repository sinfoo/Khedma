"use client";

import { useState } from "react";
import { Check, Copy, Handshake, Link2, Loader2, Mail, MailCheck, MessageSquareReply, PartyPopper, Send, Sparkles, UserRound } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { EngineChip } from "@/components/ui";
import type { MessageType } from "@/lib/ai/apps";
import { draftMessage, markMessageSent } from "@/app/actions/applications";
import { useRun } from "./use-run";

const ICON: Record<MessageType, React.ReactNode> = {
  followup: <MessageSquareReply size={16} aria-hidden="true" />,
  thanks: <PartyPopper size={16} aria-hidden="true" />,
  linkedin: <Link2 size={16} aria-hidden="true" />,
  recruiter: <UserRound size={16} aria-hidden="true" />,
  negotiate: <Handshake size={16} aria-hidden="true" />,
  accept: <Send size={16} aria-hidden="true" />,
};
const MESSAGE_TYPES = Object.keys(ICON) as MessageType[];
const LINKEDIN_MAX = 300; // same limit as LINKEDIN_MAX in lib/ai/apps

export function MessagesPanel({
  id,
  contacts,
  defaultDays,
  suggested,
}: {
  id: number;
  contacts: { id: number; name: string; email: string }[];
  defaultDays: number;
  suggested: MessageType;
}) {
  const { t } = useT();
  const m = t.apps2.messages;
  const toast = useToast();
  const [type, setType] = useState<MessageType>(suggested);
  const [days, setDays] = useState(defaultDays);
  const [contactId, setContactId] = useState<number | null>(contacts[0]?.id ?? null);
  const [draft, setDraft] = useState<{ subject: string; body: string; engine: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [gen, runGen] = useRun();
  const [sending, runSend] = useRun();
  const contact = contacts.find((c) => c.id === contactId);
  const tooLong = type === "linkedin" && (draft?.body.length ?? 0) > LINKEDIN_MAX;

  const generate = () => runGen(() => draftMessage(id, type, { days, contactId }), undefined, (r) => setDraft({ subject: r.subject, body: r.body, engine: r.engine }));
  const mailto = draft
    ? `mailto:${encodeURIComponent(contact?.email ?? "")}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : "";

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[300px_1fr]">
      <fieldset className="card p-3">
        <legend className="sr-only">{m.typeLabel}</legend>
        <div className="space-y-1">
          {MESSAGE_TYPES.map((k) => (
            <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)] has-[:focus-visible]:[outline-style:solid] ${type === k ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
              <input
                type="radio"
                name="msg-type"
                value={k}
                checked={type === k}
                onChange={() => {
                  setType(k);
                  setDraft(null);
                }}
                className="sr-only"
              />
              <span className={`mt-0.5 ${type === k ? "text-accent-text" : "text-muted"}`}>{ICON[k]}</span>
              <span>
                <span className="block text-sm font-semibold">{m.types[k]}</span>
                <span className="block text-xs text-muted">{m.typeHints[k]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="card p-5" aria-labelledby="msg-h">
        <h2 id="msg-h" className="sr-only">{m.types[type]}</h2>
        <div className="flex flex-wrap items-end gap-3">
          {type === "followup" && (
            <div>
              <label className="label" htmlFor="msg-days">{m.days}</label>
              <input id="msg-days" type="number" min={1} max={90} className="input w-24 tabular" value={days} onChange={(e) => setDays(Number(e.target.value) || 7)} />
            </div>
          )}
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="msg-contact">{m.recipient}</label>
            <select id="msg-contact" className="input" value={contactId ?? ""} onChange={(e) => setContactId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{m.noContact}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ""}</option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-primary" onClick={generate} disabled={gen} aria-busy={gen}>
            {gen ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
            {gen ? t.common.generating : draft ? t.common.regenerate : m.generate}
          </button>
        </div>

        <div aria-live="polite" className="mt-5">
          {!draft ? (
            gen ? (
              <div className="space-y-2" aria-hidden="true">
                {[60, 95, 85, 90, 40].map((w, i) => <div key={i} className="skeleton h-4" style={{ width: `${w}%` }} />)}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{m.empty}</p>
            )
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{m.draft}</p>
                <EngineChip engine={draft.engine} t={t} />
              </div>
              {type !== "linkedin" && (
                <div>
                  <label className="label" htmlFor="msg-subject">{m.subject}</label>
                  <input id="msg-subject" className="input" maxLength={200} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                </div>
              )}
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="label" htmlFor="msg-body">{m.body}</label>
                  {type === "linkedin" && (
                    <span className={`mono text-xs tabular ${tooLong ? "font-semibold text-danger" : "text-muted"}`}>
                      {fmt(m.chars, { n: draft.body.length, max: LINKEDIN_MAX })}
                    </span>
                  )}
                </div>
                <textarea
                  id="msg-body"
                  className="input !min-h-64 leading-relaxed"
                  value={draft.body}
                  aria-invalid={tooLong || undefined}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
                {tooLong && <p className="mt-1 text-sm text-danger">{m.tooLong}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    navigator.clipboard.writeText(type === "linkedin" ? draft.body : `${draft.subject}\n\n${draft.body}`).then(
                      () => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      },
                      () => toast.error(t.common.error),
                    )
                  }
                >
                  {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied ? t.common.copied : t.common.copy}
                </button>
                {type !== "linkedin" && (
                  <a href={mailto} className="btn btn-secondary btn-sm">
                    <Mail size={14} aria-hidden="true" /> {contact?.email ? fmt(m.mailtoTo, { email: contact.email }) : m.mailto}
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm ml-auto"
                  disabled={sending || tooLong}
                  aria-busy={sending}
                  onClick={() => runSend(() => markMessageSent(id, type, draft.subject), type === "followup" ? m.sentFollowup : m.sent)}
                >
                  <MailCheck size={14} aria-hidden="true" /> {m.markSent}
                </button>
              </div>
              <span role="status" className="sr-only">{copied ? t.common.copied : ""}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
