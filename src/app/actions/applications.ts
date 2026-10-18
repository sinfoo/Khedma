"use server";

import { revalidatePath } from "next/cache";
import { getApplication, getJob, getProfile, updateApplication } from "@/lib/db";
import { prepareInterview } from "@/lib/ai";
import { cvBase, generateMessage, isMessageType, letterFromSource, tailorFromSource, type MessageType } from "@/lib/ai/apps";
import { getCvSource } from "@/lib/cv/source";
import { getDict, getLocale } from "@/lib/i18n/server";
import { listDebriefs } from "@/lib/repo/coach";
import { classifyReplyAI } from "@/lib/ai/reply";
import { draftFollowup, isDraftVariant, type FollowupDraft } from "@/lib/ai/cadence";
import { isReplyKind, MAX_REPLY_CHARS, type ReplyResult } from "@/lib/apps/reply";
import {
  addReminder as repoAddReminder,
  applyStageChange,
  cadenceFor,
  COMPARE_DIMS,
  completeFollowups,
  getCompareWeights,
  setCompareWeights,
  setRating,
  type CompareDim,
  deleteContact as repoDeleteContact,
  deleteInterview as repoDeleteInterview,
  deleteReminder as repoDeleteReminder,
  getExtras,
  isCheckKey,
  isDate,
  isDateTime,
  isKind,
  isState,
  listContacts,
  logEvent,
  saveContact as repoSaveContact,
  saveInterview as repoSaveInterview,
  setExtras,
  setReminderDone,
  undoStageChange,
  type MoveSnapshot,
  type Result,
} from "@/lib/repo/apps";

const clamp = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const okId = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

async function fail(key: "notFound" | "invalid" | "generic"): Promise<{ ok: false; error: string }> {
  const { t } = await getDict();
  return { ok: false, error: t.apps2.err[key] };
}

// Dashboard and calendar read the same tables, so refresh the whole app segment.
const refresh = () => revalidatePath("/app", "layout");

function exists(id: unknown): id is number {
  return okId(id) && !!getApplication(id);
}

// ---------- stage ----------
export async function moveApplication(id: number, status: string): Promise<Result<{ snapshot: MoveSnapshot; askInterview: boolean; askReason: boolean }>> {
  if (!exists(id)) return fail("notFound");
  if (!isState(status)) return fail("invalid");
  const { t } = await getDict();
  try {
    const r = applyStageChange(id, status, t.apps2.reminders.autoFollowup);
    if (!r) return fail("notFound");
    refresh();
    return { ok: true, snapshot: r.snapshot, askInterview: r.fx.askInterview, askReason: r.fx.askReason };
  } catch {
    return fail("generic");
  }
}

export async function undoMove(id: number, s: MoveSnapshot): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  const valid =
    s &&
    isState(s.status) &&
    (s.applied_at === null || (typeof s.applied_at === "string" && !Number.isNaN(Date.parse(s.applied_at)))) &&
    (s.next_action_at === null || isDate(s.next_action_at)) &&
    Array.isArray(s.eventIds) &&
    s.eventIds.length <= 5 &&
    s.eventIds.every(okId) &&
    (s.reminderId === null || okId(s.reminderId));
  if (!valid) return fail("invalid");
  undoStageChange(id, s);
  refresh();
  return { ok: true };
}

// ---------- overview ----------
export async function saveNotes(id: number, notes: string): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  updateApplication(id, { notes: clamp(notes, 10_000) });
  return { ok: true };
}

export async function setNextAction(id: number, date: string | null): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  if (date !== null && date !== "" && !isDate(date)) return fail("invalid");
  updateApplication(id, { next_action_at: date || null });
  refresh();
  return { ok: true };
}

export async function toggleChecklist(id: number, key: string, done: boolean): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  if (!isCheckKey(key)) return fail("invalid");
  const cur = getExtras(id).checklist.filter((k) => k !== key);
  setExtras(id, { checklist: done ? [...cur, key] : cur });
  refresh();
  return { ok: true };
}

export async function addNote(id: number, text: string): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  const note = clamp(text, 2000);
  if (!note) return fail("invalid");
  logEvent(id, "note", note);
  refresh();
  return { ok: true };
}

// ---------- documents ----------
function cvInput(id: number) {
  const ov = getExtras(id).cv_override_text;
  if (ov && ov.trim()) return { text: ov, format: "text" as const };
  const src = getCvSource();
  return { text: src.text, format: src.format };
}

export async function saveDoc(id: number, kind: "cv" | "letter", md: string): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  if (kind !== "cv" && kind !== "letter") return fail("invalid");
  updateApplication(id, kind === "cv" ? { cv_md: String(md).slice(0, 60_000) } : { cover_letter_md: String(md).slice(0, 20_000) });
  logEvent(id, "doc", kind === "cv" ? "cv-edit" : "letter-edit");
  refresh();
  return { ok: true };
}

export async function generateDoc(id: number, kind: "cv" | "letter"): Promise<Result<{ engine: string }>> {
  if (!exists(id)) return fail("notFound");
  if (kind !== "cv" && kind !== "letter") return fail("invalid");
  const app = getApplication(id)!;
  const job = getJob(app.job_id);
  if (!job) return fail("notFound");
  const src = cvInput(id);
  if (src.text.trim().length < 50) {
    const { t } = await getDict();
    return { ok: false, error: t.apps2.docs.needCv };
  }
  try {
    const locale = await getLocale();
    const profile = getProfile();
    const { md, engine } = kind === "cv" ? await tailorFromSource(job, profile, src, locale) : await letterFromSource(job, profile, src, locale);
    if (!md.trim()) return fail("generic");
    updateApplication(id, kind === "cv" ? { cv_md: md } : { cover_letter_md: md });
    setExtras(id, kind === "cv" ? { cv_engine: engine } : { letter_engine: engine });
    logEvent(id, "doc", kind);
    refresh();
    return { ok: true, engine };
  } catch {
    return fail("generic");
  }
}

export async function clearCvOverride(id: number): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  setExtras(id, { cv_override_text: null, cv_override_name: null, cv_override_at: null });
  refresh();
  return { ok: true };
}

export async function generatePrep(id: number): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  const app = getApplication(id)!;
  const job = getJob(app.job_id);
  if (!job) return fail("notFound");
  try {
    const src = cvInput(id);
    const profile = getProfile();
    const prep = await prepareInterview(job, { ...profile, cv_md: cvBase(src) || profile.cv_md }, await getLocale());
    updateApplication(id, { interview_prep: prep });
    logEvent(id, "doc", "interview");
    refresh();
    return { ok: true };
  } catch {
    return fail("generic");
  }
}

// ---------- messages ----------
export async function draftMessage(
  id: number,
  type: string,
  opts: { days?: number; contactId?: number | null },
): Promise<Result<{ subject: string; body: string; engine: string }>> {
  if (!exists(id)) return fail("notFound");
  if (!isMessageType(type)) return fail("invalid");
  const app = getApplication(id)!;
  const job = getJob(app.job_id);
  if (!job) return fail("notFound");
  const days = Math.min(90, Math.max(1, Math.round(Number(opts?.days) || 7)));
  const contact = okId(opts?.contactId) ? listContacts(id).find((c) => c.id === opts.contactId) : undefined;
  try {
    // thank-you notes cite what went well in the latest debrief of this application
    const db = type === "thanks" ? listDebriefs(100).find((x) => x.application_id === id) : undefined;
    const topics = db ? [...db.questions.filter((q) => q.rating === "green").map((q) => q.competency || q.question), ...db.competencies].filter(Boolean).slice(0, 3) : undefined;
    const r = await generateMessage(type, { job, profile: getProfile(), locale: await getLocale(), contactName: contact?.name, days, topics });
    return { ok: true, ...r };
  } catch {
    return fail("generic");
  }
}

export async function markMessageSent(id: number, type: string, subject: string): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  if (!isMessageType(type) && !isDraftVariant(type)) return fail("invalid");
  const { t } = await getDict();
  const label = isMessageType(type) ? t.apps2.messages.types[type as MessageType] : t.apps2.cadence.variants[type];
  const isFollowup = type === "followup" || isDraftVariant(type);
  logEvent(id, isFollowup ? "followup" : "message", `${label}${subject.trim() ? ` · ${clamp(subject, 200)}` : ""}`);
  if (isFollowup) completeFollowups(id);
  refresh();
  return { ok: true };
}

/** Cadence-aware follow-up draft: first / second (new angle) / thank-you / reply / no-show. */
export async function draftCadenceMessage(id: number, variant: string, opts: { contactId?: number | null; missedAt?: string | null }): Promise<Result<FollowupDraft>> {
  if (!exists(id)) return fail("notFound");
  if (!isDraftVariant(variant)) return fail("invalid");
  const app = getApplication(id)!;
  const job = getJob(app.job_id);
  if (!job) return fail("notFound");
  const contact = okId(opts?.contactId) ? listContacts(id).find((c) => c.id === opts.contactId) : undefined;
  const cad = cadenceFor([{ id, status: app.status, applied_at: app.applied_at, company: job.company }]).get(id);
  try {
    const r = await draftFollowup(variant, {
      job,
      profile: getProfile(),
      locale: await getLocale(),
      contactName: contact?.name,
      days: cad?.daysSince ?? 7,
      appliedOn: app.applied_at?.slice(0, 10) ?? null,
      missedAt: isDateTime(opts?.missedAt) ? opts.missedAt!.replace("T", " ") : null,
    });
    return { ok: true, ...r };
  } catch {
    return fail("generic");
  }
}

// ---------- reply classifier ----------
export async function classifyReply(id: number, text: string): Promise<Result<{ result: ReplyResult & { engine: string } }>> {
  if (!exists(id)) return fail("notFound");
  const body = clamp(text, 8000);
  if (body.length < 10) return fail("invalid");
  try {
    return { ok: true, result: await classifyReplyAI(getProfile().settings, body) };
  } catch {
    return fail("generic");
  }
}

export interface ApplyReplyForm {
  kind: string;
  stage: string | null;
  date: string | null;
  time: string | null;
  link: string | null;
  interviewer: string | null;
  round: string | null;
  text: string;
}

/** Apply a classified reply: log it, move the stage, create the interview when a date is known. */
export async function applyReply(id: number, f: ApplyReplyForm): Promise<Result<{ moved: boolean; interview: boolean }>> {
  if (!exists(id)) return fail("notFound");
  if (!f || !isReplyKind(f.kind)) return fail("invalid");
  const stage = f.stage ? (isState(f.stage) ? f.stage : null) : null;
  if (f.stage && !stage) return fail("invalid");
  const { t } = await getDict();
  const kindLabel = t.apps2.reply.kinds[f.kind];
  logEvent(id, "message", `${kindLabel}\n${clamp(f.text, MAX_REPLY_CHARS)}`);
  let moved = false;
  let interview = false;
  const app = getApplication(id)!;
  if (stage && stage !== app.status) {
    const r = applyStageChange(id, stage, t.apps2.reminders.autoFollowup);
    moved = !!r;
  }
  if (isDate(f.date) && (f.kind === "interview" || stage === "interview")) {
    const starts = `${f.date}T${/^\d{2}:\d{2}$/.test(f.time ?? "") ? f.time : "10:00"}`;
    const kind = isKind(f.round) ? f.round : "technical";
    const link = f.link && /^https?:\/\//.test(f.link) ? clamp(f.link, 300) : "";
    const notes = f.interviewer ? clamp(f.interviewer, 120) : "";
    repoSaveInterview(id, { starts_at: starts, duration_min: 45, kind, location: link, notes, outcome: "" });
    logEvent(id, "interview", `${t.apps2.interviews.kinds[kind]} · ${starts.replace("T", " ")}`);
    const cur = getApplication(id)!;
    if (!cur.next_action_at || cur.next_action_at > f.date) updateApplication(id, { next_action_at: f.date });
    interview = true;
  }
  refresh();
  return { ok: true, moved, interview };
}

// ---------- compare ----------
export async function saveCompareWeights(w: Record<string, number>): Promise<Result> {
  const out = { ...getCompareWeights() };
  for (const k of COMPARE_DIMS) {
    const v = Number(w?.[k]);
    if (Number.isFinite(v)) out[k as CompareDim] = Math.min(100, Math.max(0, Math.round(v)));
  }
  setCompareWeights(out);
  revalidatePath("/app/pipeline/compare");
  return { ok: true };
}

export async function savePersonalRating(id: number, n: number): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 0 || v > 5) return fail("invalid");
  setRating(id, v);
  revalidatePath("/app/pipeline/compare");
  return { ok: true };
}

// ---------- interviews ----------
export interface InterviewForm {
  starts_at: string;
  duration_min: number;
  kind: string;
  location: string;
  notes: string;
  outcome: string;
}

export async function saveInterview(id: number, f: InterviewForm, interviewId?: number): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  if (!f || !isDateTime(f.starts_at) || !isKind(f.kind)) return fail("invalid");
  if (interviewId !== undefined && !okId(interviewId)) return fail("invalid");
  const data = {
    starts_at: f.starts_at,
    duration_min: Math.min(600, Math.max(5, Math.round(Number(f.duration_min) || 45))),
    kind: f.kind,
    location: clamp(f.location, 300),
    notes: clamp(f.notes, 4000),
    outcome: clamp(f.outcome, 40),
  };
  repoSaveInterview(id, data, interviewId);
  if (!interviewId) {
    const { t } = await getDict();
    logEvent(id, "interview", `${t.apps2.interviews.kinds[data.kind]} · ${data.starts_at.replace("T", " ")}`);
    const app = getApplication(id)!;
    if (!app.next_action_at || app.next_action_at > data.starts_at.slice(0, 10)) updateApplication(id, { next_action_at: data.starts_at.slice(0, 10) });
  }
  refresh();
  return { ok: true };
}

export async function deleteInterview(id: number, interviewId: number): Promise<Result> {
  if (!exists(id) || !okId(interviewId)) return fail("invalid");
  repoDeleteInterview(id, interviewId);
  refresh();
  return { ok: true };
}

// ---------- contacts ----------
export interface ContactForm {
  name: string;
  role: string;
  email: string;
  phone: string;
  linkedin: string;
  notes: string;
}

export async function saveContact(id: number, f: ContactForm, contactId?: number): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  const c = {
    name: clamp(f?.name, 120),
    role: clamp(f?.role, 120),
    email: clamp(f?.email, 200),
    phone: clamp(f?.phone, 40),
    linkedin: clamp(f?.linkedin, 300),
    notes: clamp(f?.notes, 2000),
  };
  if (!c.name) return fail("invalid");
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return fail("invalid");
  if (c.linkedin && !/^https?:\/\//i.test(c.linkedin)) c.linkedin = `https://${c.linkedin.replace(/^\/+/, "")}`;
  if (contactId !== undefined && !okId(contactId)) return fail("invalid");
  repoSaveContact(id, c, contactId);
  refresh();
  return { ok: true };
}

export async function deleteContact(id: number, contactId: number): Promise<Result> {
  if (!exists(id) || !okId(contactId)) return fail("invalid");
  repoDeleteContact(id, contactId);
  refresh();
  return { ok: true };
}

// ---------- reminders ----------
export async function addReminder(id: number, title: string, due: string): Promise<Result> {
  if (!exists(id)) return fail("notFound");
  const tt = clamp(title, 200);
  if (!tt || !(isDate(due) || isDateTime(due))) return fail("invalid");
  repoAddReminder({ application_id: id, title: tt, due_at: due });
  refresh();
  return { ok: true };
}

export async function toggleReminder(id: number, reminderId: number, done: boolean): Promise<Result> {
  if (!exists(id) || !okId(reminderId)) return fail("invalid");
  setReminderDone(id, reminderId, !!done);
  refresh();
  return { ok: true };
}

export async function deleteReminder(id: number, reminderId: number): Promise<Result> {
  if (!exists(id) || !okId(reminderId)) return fail("invalid");
  repoDeleteReminder(id, reminderId);
  refresh();
  return { ok: true };
}
