"use client";

import Link from "next/link";
import { useState } from "react";
import { AlarmClock, Check, Copy, Handshake, Link2, Loader2, Mail, MailCheck, MessageSquareReply, PartyPopper, PhoneMissed, Reply, Send, Snowflake, Sparkles, UserRound } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { EngineChip } from "@/components/ui";
import type { MessageType } from "@/lib/ai/apps";
import { DRAFT_VARIANTS, isDraftVariant, type DraftVariant } from "@/lib/ai/cadence";
import { draftCadenceMessage, draftMessage, markMessageSent } from "@/app/actions/applications";
import { WritingLint } from "@/components/writing-lint";
import { useRun } from "./use-run";
import type { CadenceView } from "./cadence";

const ICON: Record<MessageType, React.ReactNode> = {
  followup: <MessageSquareReply size={16} aria-hidden="true" />,
  thanks: <PartyPopper size={16} aria-hidden="true" />,
  linkedin: <Link2 size={16} aria-hidden="true" />,
  recruiter: <UserRound size={16} aria-hidden="true" />,
  negotiate: <Handshake size={16} aria-hidden="true" />,
  accept: <Send size={16} aria-hidden="true" />,
};
const VICON: Record<DraftVariant, React.ReactNode> = {
  first: <AlarmClock size={16} aria-hidden="true" />,
  second: <Sparkles size={16} aria-hidden="true" />,
  thankyou: <PartyPopper size={16} aria-hidden="true" />,
  reply: <Reply size={16} aria-hidden="true" />,
  noshow: <PhoneMissed size={16} aria-hidden="true" />,
};
// Cadence variants cover follow-up and thank-you; the generic list keeps the rest.
const MESSAGE_TYPES = (Object.keys(ICON) as MessageType[]).filter((k) => k !== "followup" && k !== "thanks");
const LINKEDIN_MAX = 300; // same limit as LINKEDIN_MAX in lib/ai/apps
type Pick = MessageType | DraftVariant;

export function MessagesPanel({
  id,
  contacts,
  suggested,
  cadence,
  initialDraft,
}: {
  id: number;
  contacts: { id: number; name: string; email: string }[];
  defaultDays: number;
  suggested: MessageType;
  cadence: CadenceView | null;
  initialDraft?: string;
}) {
  const { t } = useT();
  const m = t.apps2.messages;
  const c = t.apps2.cadence;
  const toast = useToast();
  const start: Pick = isDraftVariant(initialDraft) ? initialDraft : cadence && cadence.angle !== "none" && cadence.urgency !== "cold" ? cadence.angle : suggested === "followup" ? "first" : suggested === "thanks" ? "thankyou" : suggested;
  const [type, setType] = useState<Pick>(start);
  const [contactId, setContactId] = useState<number | null>(contacts[0]?.id ?? null);
  const [missedAt, setMissedAt] = useState("");
  const [draft, setDraft] = useState<{ subject: string; body: string; engine: string; issues: string[]; lint: { rule: string; excerpt: string; suggestion: string }[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [gen, runGen] = useRun();
  const [sending, runSend] = useRun();
  const contact = contacts.find((x) => x.id === contactId);
  const tooLong = type === "linkedin" && (draft?.body.length ?? 0) > LINKEDIN_MAX;
  const isVariant = isDraftVariant(type);
  const cold = cadence?.urgency === "cold" && (type === "first" || type === "second");

  const generate = () =>
    isVariant
      ? runGen(() => draftCadenceMessage(id, type, { contactId, missedAt: missedAt || null }), undefined, (r) => setDraft({ subject: r.subject, body: r.body, engine: r.engine, issues: r.issues, lint: r.lint }))
      : runGen(() => draftMessage(id, type, { contactId }), undefined, (r) => setDraft({ subject: r.subject, body: r.body, engine: r.engine, issues: [], lint: [] }));
  const mailto = draft
    ? `mailto:${encodeURIComponent(contact?.email ?? "")}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : "";
  const label = (k: Pick) => (isDraftVariant(k) ? c.variants[k] : m.types[k]);
  const hint = (k: Pick) => (isDraftVariant(k) ? c.variantHints[k] : m.typeHints[k]);

  const option = (k: Pick) => (
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
      <span className={`mt-0.5 ${type === k ? "text-accent-text" : "text-muted"}`}>{isDraftVariant(k) ? VICON[k] : ICON[k]}</span>
      <span>
        <span className="block text-sm font-semibold">
          {label(k)}
          {cadence && cadence.angle === k && (cadence.urgency === "overdue" || cadence.urgency === "urgent") && <span className="chip chip-saffron ml-2 !py-0 text-[0.65rem]">{c.urgency[cadence.urgency]}</span>}
        </span>
        <span className="block text-xs text-muted">{hint(k)}</span>
      </span>
    </label>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[300px_1fr]">
      <fieldset className="card p-3">
        <legend className="sr-only">{m.typeLabel}</legend>
        <div className="space-y-1">
          {DRAFT_VARIANTS.map(option)}
          <div role="separator" className="my-1 border-t border-line" />
          {MESSAGE_TYPES.map(option)}
        </div>
      </fieldset>

      <section className="card p-5" aria-labelledby="msg-h">
        <h2 id="msg-h" className="sr-only">{label(type)}</h2>
        {cold ? (
          <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold"><Snowflake size={16} aria-hidden="true" className="text-muted" /> {c.coldBlock}</p>
            <p className="mt-1 text-muted">{c.coldHint}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/app/pipeline/${id}?tab=contacts`} className="btn btn-secondary btn-sm">{c.coldContact}</Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            {type === "noshow" && (
              <div>
                <label className="label" htmlFor="msg-missed">{c.missedAt}</label>
                <input id="msg-missed" type="datetime-local" className="input tabular" value={missedAt} onChange={(e) => setMissedAt(e.target.value)} />
              </div>
            )}
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor="msg-contact">{m.recipient}</label>
              <select id="msg-contact" className="input" value={contactId ?? ""} onChange={(e) => setContactId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{m.noContact}</option>
                {contacts.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}{x.email ? ` · ${x.email}` : ""}</option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-primary" onClick={generate} disabled={gen} aria-busy={gen}>
              {gen ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
              {gen ? t.common.generating : draft ? t.common.regenerate : m.generate}
            </button>
          </div>
        )}

        <div aria-live="polite" className="mt-5">
          {cold ? null : !draft ? (
            gen ? (
              <div className="space-y-2" aria-hidden="true">
                {[60, 95, 85, 90, 40].map((w, i) => <div key={i} className="skeleton h-4" style={{ width: `${w}%` }} />)}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{m.empty}</p>
            )
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{m.draft}</p>
                <span className="flex flex-wrap items-center gap-1.5">
                  {draft.issues.map((i) => (
                    <span key={i} className="chip chip-saffron !py-0 text-[0.7rem]">{c.issues[i as keyof typeof c.issues] ?? i}</span>
                  ))}
                  <EngineChip engine={draft.engine} t={t} />
                </span>
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
                <WritingLint
                  className="mt-3"
                  text={draft.body}
                  onReplace={(sentence, next) => setDraft({ ...draft, body: draft.body.replace(sentence, next) })}
                  onEdit={(f) => {
                    const el = document.getElementById("msg-body") as HTMLTextAreaElement | null;
                    if (!el) return;
                    el.focus();
                    const at = el.value.indexOf(f.excerpt);
                    if (at >= 0) el.setSelectionRange(at, at + f.excerpt.length);
                  }}
                />
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
                  onClick={() => runSend(() => markMessageSent(id, type, draft.subject), isVariant ? m.sentFollowup : m.sent)}
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
