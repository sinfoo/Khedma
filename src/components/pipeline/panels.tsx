"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  Clock,
  GraduationCap,
  Link2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRound,
  Video,
} from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { fold } from "@/lib/sources/classify";
import { Dialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit";
import type { Contact, Interview } from "@/lib/types";
import type { AppReminder } from "@/lib/repo/apps";
import { addNote, addReminder, deleteContact, deleteInterview, deleteReminder, saveContact, toggleReminder } from "@/app/actions/applications";
import { InterviewDialog, defaultSlot } from "./stage";
import { shortDate } from "./format";
import { useRun } from "./use-run";

// ---------- interviews ----------
export function InterviewsPanel({ appId, interviews, today }: { appId: number; interviews: Interview[]; today: string }) {
  const { t, locale } = useT();
  const a = t.apps2.interviews;
  const [edit, setEdit] = useState<(Partial<Interview> & { starts_at: string }) | null>(null);
  const [pending, run] = useRun();
  const upcoming = interviews.filter((i) => i.starts_at.slice(0, 10) >= today);
  const past = interviews.filter((i) => i.starts_at.slice(0, 10) < today).reverse();

  const row = (iv: Interview) => {
    const isUrl = /^https?:\/\//.test(iv.location);
    return (
      <li key={iv.id} className="card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-saffron-soft text-center leading-none text-saffron">
            <span className="text-[0.65rem] font-semibold uppercase">{shortDate(iv.starts_at.slice(0, 10), locale).split(" ")[1] ?? ""}</span>
            <span className="display text-lg">{Number(iv.starts_at.slice(8, 10))}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {a.kinds[iv.kind] ?? iv.kind}
              {iv.outcome && <span className={`chip ml-2 !py-0 text-[0.7rem] ${iv.outcome === "positive" ? "chip-success" : iv.outcome === "negative" ? "chip-danger" : ""}`}>{a.outcomes[iv.outcome as keyof typeof a.outcomes] ?? iv.outcome}</span>}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1 tabular"><Clock size={13} aria-hidden="true" /> {shortDate(iv.starts_at, locale, true)} · {fmt(a.minutes, { n: iv.duration_min })}</span>
              {iv.location &&
                (isUrl ? (
                  <a href={iv.location} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                    <Video size={13} aria-hidden="true" /> {a.joinLink}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden="true" /> {iv.location}</span>
                ))}
            </p>
            {iv.notes && <p className="mt-2 whitespace-pre-line text-sm text-ink-2">{iv.notes}</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
          <a href={`/api/ics/interview/${iv.id}`} className="btn btn-ghost btn-sm" download>
            <CalendarPlus size={14} aria-hidden="true" /> {a.ics}
          </a>
          {iv.starts_at.slice(0, 10) < today ? (
            <Link href={`/app/coach/debrief/new?application=${appId}`} className={`btn btn-sm ${iv.outcome ? "btn-ghost" : "btn-saffron"}`}>
              <GraduationCap size={14} aria-hidden="true" /> {a.debrief}
            </Link>
          ) : (
            <Link href={`/app/coach?application=${appId}`} className="btn btn-ghost btn-sm">
              <GraduationCap size={14} aria-hidden="true" /> {a.prepare}
            </Link>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(iv)}>
            <Pencil size={14} aria-hidden="true" /> {t.common.edit}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm text-danger"
            disabled={pending}
            onClick={() => window.confirm(a.deleteConfirm) && run(() => deleteInterview(appId, iv.id), a.deleted)}
          >
            <Trash2 size={14} aria-hidden="true" /> {t.common.delete}
          </button>
        </div>
      </li>
    );
  };

  return (
    <section aria-labelledby="iv-h">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="iv-h" className="text-lg">{a.title}</h2>
        <div className="flex gap-2">
          <Link href="/app/calendar" className="btn btn-ghost btn-sm">
            <CalendarDays size={14} aria-hidden="true" /> {a.calendar}
          </Link>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({ starts_at: defaultSlot() })}>
            <Plus size={14} aria-hidden="true" /> {a.add}
          </button>
        </div>
      </div>
      {interviews.length === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-muted">{a.empty}</p>
      ) : (
        <div className="space-y-5">
          {upcoming.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted" style={{ fontFamily: "var(--font-sans)" }}>{a.upcoming}</h3>
              <ul className="space-y-2">{upcoming.map(row)}</ul>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted" style={{ fontFamily: "var(--font-sans)" }}>{a.past}</h3>
              <ul className="space-y-2">{past.map(row)}</ul>
            </div>
          )}
        </div>
      )}
      {edit && <InterviewDialog appId={appId} open onClose={() => setEdit(null)} initial={edit} title={edit.id ? a.edit : a.add} />}
    </section>
  );
}

// ---------- contacts ----------
const FIELDS = ["name", "role", "company", "email", "phone", "linkedin", "notes"] as const;

/**
 * One application's contacts (appId), or the whole network (appId null: the Contacts page, where each person
 * keeps the application they came from and a search appears once the list is long).
 */
export function ContactsPanel({ appId, contacts, title }: { appId: number | null; contacts: (Contact & { job_title?: string | null })[]; title?: string }) {
  const { t } = useT();
  const c = t.apps2.contacts;
  const [edit, setEdit] = useState<Partial<Contact> | null>(null);
  const [q, setQ] = useState("");
  const [pending, run] = useRun();
  const formId = "contact-form";
  const needle = fold(q.trim());
  const shown = needle ? contacts.filter((p) => fold([p.name, p.role, p.company, p.email, p.notes, p.job_title ?? ""].join(" ")).includes(needle)) : contacts;

  return (
    <section aria-labelledby="ct-h">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="ct-h" className="text-lg">{title ?? c.title}</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({})}>
          <Plus size={14} aria-hidden="true" /> {c.add}
        </button>
      </div>
      {contacts.length > 6 && (
        <div className="mb-3">
          <label htmlFor="ct-q" className="sr-only">{c.search}</label>
          <input id="ct-q" type="search" className="input" placeholder={c.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {contacts.length === 0 ? (
        <EmptyState icon={<UserRound size={22} aria-hidden="true" />} title={c.empty} hint={c.emptyHint} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((p) => (
            <li key={p.id} className="card p-4">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent-text">
                  {p.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name}</p>
                  {(p.role || p.company) && <p className="text-sm text-muted">{[p.role, p.company].filter(Boolean).join(" · ")}</p>}
                  {appId === null && p.application_id !== null && (
                    <Link href={`/app/pipeline/${p.application_id}?tab=overview`} className="text-sm text-accent-text hover:underline">
                      {fmt(c.metVia, { offer: p.job_title ?? `#${p.application_id}` })}
                    </Link>
                  )}
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {p.email && (
                  <li>
                    <a href={`mailto:${p.email}`} className="inline-flex items-center gap-2 text-accent-text hover:underline">
                      <Mail size={14} aria-hidden="true" /> {p.email}
                    </a>
                  </li>
                )}
                {p.phone && (
                  <li>
                    <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 text-accent-text hover:underline">
                      <Phone size={14} aria-hidden="true" /> <span className="tabular">{p.phone}</span>
                    </a>
                  </li>
                )}
                {/^https?:\/\//.test(p.linkedin) && (
                  <li>
                    <a href={p.linkedin} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 text-accent-text hover:underline">
                      <Link2 size={14} aria-hidden="true" /> {c.linkedinProfile}
                    </a>
                  </li>
                )}
              </ul>
              {p.notes && <p className="mt-2 whitespace-pre-line text-sm text-ink-2">{p.notes}</p>}
              <div className="mt-3 flex gap-1.5 border-t border-line pt-3">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(p)} aria-label={`${t.common.edit} — ${p.name}`}>
                  <Pencil size={14} aria-hidden="true" /> {t.common.edit}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-danger"
                  disabled={pending}
                  aria-label={`${t.common.delete} — ${p.name}`}
                  onClick={() => window.confirm(c.deleteConfirm) && run(() => deleteContact(p.application_id, p.id), c.deleted)}
                >
                  <Trash2 size={14} aria-hidden="true" /> {t.common.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <Dialog
          open
          onClose={() => setEdit(null)}
          title={edit.id ? c.edit : c.add}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>{t.common.cancel}</button>
              <button type="submit" form={formId} className="btn btn-primary" disabled={pending} aria-busy={pending}>{t.common.save}</button>
            </>
          }
        >
          <form
            id={formId}
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const f = Object.fromEntries(FIELDS.map((k) => [k, String(fd.get(k) ?? "")])) as Record<(typeof FIELDS)[number], string>;
              run(() => saveContact(edit.id ? (edit.application_id ?? null) : appId, f, edit.id), c.saved, () => setEdit(null));
            }}
          >
            {FIELDS.map((k) => (
              <div key={k} className={k === "notes" || k === "linkedin" ? "sm:col-span-2" : ""}>
                <label className="label" htmlFor={`ct-${k}`}>
                  {c.fields[k]} {k === "name" && <span aria-hidden="true" className="text-danger">*</span>}
                </label>
                {k === "notes" ? (
                  <textarea id={`ct-${k}`} name={k} className="input !min-h-20" maxLength={2000} defaultValue={edit[k] ?? ""} />
                ) : (
                  <input
                    id={`ct-${k}`}
                    name={k}
                    className="input"
                    required={k === "name"}
                    type={k === "email" ? "email" : k === "phone" ? "tel" : k === "linkedin" ? "url" : "text"}
                    autoComplete="off"
                    maxLength={k === "linkedin" ? 300 : 200}
                    placeholder={k === "linkedin" ? "https://www.linkedin.com/in/…" : k === "phone" ? "+216 …" : undefined}
                    defaultValue={edit[k] ?? ""}
                  />
                )}
              </div>
            ))}
          </form>
        </Dialog>
      )}
    </section>
  );
}

// ---------- reminders ----------
export function RemindersPanel({ appId, reminders, today }: { appId: number; reminders: AppReminder[]; today: string }) {
  const { t, locale } = useT();
  const r = t.apps2.reminders;
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [pending, run] = useRun();

  return (
    <section aria-labelledby="rm-h" className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
      <div>
        <h2 id="rm-h" className="mb-3 text-lg">{r.title}</h2>
        {reminders.length === 0 ? (
          <EmptyState icon={<Bell size={22} aria-hidden="true" />} title={r.empty} hint={r.emptyHint} />
        ) : (
          <ul className="card divide-y divide-line">
            {reminders.map((x) => {
              const day = x.due_at.slice(0, 10);
              const overdue = !x.done && day < today;
              const isToday = !x.done && day === today;
              return (
                <li key={x.id} className="flex items-center gap-3 px-4 py-3">
                  <input
                    id={`rm-${x.id}`}
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={x.done}
                    disabled={pending}
                    onChange={(e) => run(() => toggleReminder(appId, x.id, e.target.checked), e.target.checked ? r.done : r.undone)}
                  />
                  <label htmlFor={`rm-${x.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className={`block text-sm ${x.done ? "text-muted line-through decoration-1" : "font-medium"}`}>{x.title}</span>
                    <span className={`mt-0.5 flex flex-wrap items-center gap-2 text-xs ${overdue ? "font-semibold text-danger" : "text-muted"}`}>
                      <span className="tabular">{shortDate(x.due_at, locale, x.due_at.length > 10)}</span>
                      {overdue && <span className="chip chip-danger !py-0 text-[0.7rem]">{r.overdue}</span>}
                      {isToday && <span className="chip chip-saffron !py-0 text-[0.7rem]">{r.today}</span>}
                      {x.kind === "followup" && <span className="chip !py-0 text-[0.7rem]">{r.followupBadge}</span>}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={`${t.common.delete} — ${x.title}`}
                    disabled={pending}
                    onClick={() => window.confirm(r.deleteConfirm) && run(() => deleteReminder(appId, x.id), r.deleted)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <form
        className="card p-5"
        aria-labelledby="rm-add-h"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addReminder(appId, title, due), r.added, () => {
            setTitle("");
            setDue("");
          });
        }}
      >
        <h3 id="rm-add-h" className="mb-3 text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{r.add}</h3>
        <label className="label" htmlFor="rm-title">{r.titleLabel}</label>
        <input id="rm-title" className="input" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={r.titlePh} />
        <label className="label mt-3" htmlFor="rm-due">{r.due}</label>
        <input id="rm-due" type="date" className="input" required value={due} onChange={(e) => setDue(e.target.value)} />
        <button type="submit" className="btn btn-primary mt-4 w-full" disabled={pending} aria-busy={pending}>
          <Plus size={14} aria-hidden="true" /> {t.common.add}
        </button>
      </form>
    </section>
  );
}

// ---------- timeline note ----------
export function NoteForm({ appId }: { appId: number }) {
  const { t } = useT();
  const l = t.apps2.timeline;
  const [text, setText] = useState("");
  const [pending, run] = useRun();
  return (
    <form
      className="card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addNote(appId, text), l.noteAdded, () => setText(""));
      }}
    >
      <label className="label" htmlFor="tl-note">{l.addNote}</label>
      <textarea id="tl-note" className="input !min-h-28" required maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder={l.notePh} />
      <div className="mt-3 flex justify-end">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !text.trim()} aria-busy={pending}>
          <Plus size={14} aria-hidden="true" /> {t.common.add}
        </button>
      </div>
    </form>
  );
}
