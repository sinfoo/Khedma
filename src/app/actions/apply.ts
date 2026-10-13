"use server";

import { revalidatePath } from "next/cache";
import { getApplication, getJob, getProfile, updateApplication } from "@/lib/db";
import { getCvSource } from "@/lib/cv/source";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { generateMessage, type MessageType } from "@/lib/ai/apps";
import { generateAnswers, type AskedQuestion, type GeneratedAnswer } from "@/lib/ai/apply";
import { QUESTION_LABEL, clampLimit, isQuestionId } from "@/lib/apply/questions";
import { deleteAnswer as repoDeleteAnswer, getPack, isChannel, isOutcome, listAnswers, saveAnswer as repoSaveAnswer, setPack, type Pack } from "@/lib/apply/repo";
import { addReminder, completeFollowups, listContacts, logEvent, openFollowup } from "@/lib/repo/apps";
import { addDays, localDate } from "@/lib/reports/digest";
import type { Result } from "@/lib/repo/apps";

const clamp = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const okId = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;
const refresh = () => revalidatePath("/app", "layout");

async function fail(key: "notFound" | "invalid" | "generic"): Promise<{ ok: false; error: string }> {
  const { t } = await getDict();
  return { ok: false, error: t.apply2.err[key] };
}

function load(id: unknown) {
  if (!okId(id)) return null;
  const app = getApplication(id);
  const job = app && getJob(app.job_id);
  return app && job ? { app, job } : null;
}

const slug = (s: string) =>
  "custom:" +
  s
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40);

/** Normalise a list of asked questions: bank ids get their label, custom ones a stable "custom:" id. */
function askedList(qids: unknown, custom: unknown, locale: "fr" | "en"): AskedQuestion[] {
  const out: AskedQuestion[] = [];
  for (const q of Array.isArray(qids) ? qids.slice(0, 12) : []) if (isQuestionId(q)) out.push({ qid: q, question: QUESTION_LABEL[locale][q] });
  for (const c of Array.isArray(custom) ? custom.slice(0, 6) : []) {
    const question = clamp(c, 200);
    if (question.length >= 3) out.push({ qid: slug(question), question });
  }
  return out;
}

// ---------- answers ----------
export async function generateFormAnswers(id: number, qids: string[], custom: string[], maxChars: number): Promise<Result<{ answers: GeneratedAnswer[] }>> {
  const ctx = load(id);
  if (!ctx) return fail("notFound");
  const { locale } = await getDict();
  const asked = askedList(qids, custom, locale);
  if (!asked.length) return fail("invalid");
  const profile = getProfile();
  const limit = clampLimit(maxChars);
  try {
    const cvText = ctx.app.cv_md?.trim() || getCvSource().text || profile.cv_md;
    const answers = await generateAnswers(asked, { job: ctx.job, profile, cvText, locale, maxChars: limit });
    for (const a of answers) repoSaveAnswer({ application_id: id, qid: a.qid, question: a.question, answer: a.answer, max_chars: limit, engine: a.engine });
    refresh();
    return { ok: true, answers };
  } catch {
    return fail("generic");
  }
}

export async function saveFormAnswer(id: number, qid: string, answer: string, maxChars: number): Promise<Result> {
  if (!load(id)) return fail("notFound");
  const q = clamp(qid, 60);
  const existing = listAnswers(id).find((a) => a.qid === q);
  if (!existing) return fail("invalid");
  repoSaveAnswer({ ...existing, answer: clamp(answer, 4000), max_chars: clampLimit(maxChars), engine: "edited" });
  refresh();
  return { ok: true };
}

export async function removeFormAnswer(id: number, qid: string): Promise<Result> {
  if (!load(id)) return fail("notFound");
  repoDeleteAnswer(id, clamp(qid, 60));
  refresh();
  return { ok: true };
}

// ---------- outreach ----------
export async function draftOutreach(id: number, kind: "recruiter" | "linkedin", contactId: number | null): Promise<Result<{ subject: string; body: string; engine: string }>> {
  const ctx = load(id);
  if (!ctx) return fail("notFound");
  if (kind !== "recruiter" && kind !== "linkedin") return fail("invalid");
  const { locale } = await getDict();
  const contact = okId(contactId) ? listContacts(id).find((c) => c.id === contactId) : undefined;
  try {
    const r = await generateMessage(kind as MessageType, { job: ctx.job, profile: getProfile(), locale, contactName: contact?.name, days: 7 });
    return { ok: true, ...r };
  } catch {
    return fail("generic");
  }
}

export async function logOutreach(id: number, kind: "recruiter" | "linkedin", body: string): Promise<Result> {
  if (!load(id)) return fail("notFound");
  if (kind !== "recruiter" && kind !== "linkedin") return fail("invalid");
  const text = clamp(body, 4000);
  if (!text) return fail("invalid");
  logEvent(id, "followup", `${kind}: ${text.slice(0, 400)}`);
  refresh();
  return { ok: true };
}

// ---------- submit ----------
export async function submitApplication(id: number, channel: string, reference: string): Promise<Result<{ followupDue: string }>> {
  const ctx = load(id);
  if (!ctx) return fail("notFound");
  if (!isChannel(channel)) return fail("invalid");
  const { t } = await getDict();
  try {
    const now = new Date();
    const answers = listAnswers(id).filter((a) => a.answer.trim()).map((a) => ({ question: a.question, answer: a.answer }));
    setPack(id, { channel, reference: clamp(reference, 120), answers, submitted_at: now.toISOString() });
    if (ctx.app.status === "evaluated" || ctx.app.status === "discarded") updateApplication(id, { status: "applied", applied_at: now.toISOString() });
    else if (!ctx.app.applied_at) updateApplication(id, { applied_at: now.toISOString() });
    const due = addDays(localDate(now), 7);
    if (!openFollowup(id)) {
      addReminder({ application_id: id, title: fmt(t.apply2.submit.reminderTitle, { title: ctx.job.title, company: ctx.job.company }), due_at: due, kind: "followup" });
      updateApplication(id, { next_action_at: due });
    }
    logEvent(id, "note", `${t.apply2.submit.done.replace("{d}", localDate(now)).replace("{channel}", t.apply2.submit.channels[channel])}${reference ? ` · ${clamp(reference, 120)}` : ""}`);
    refresh();
    return { ok: true, followupDue: due };
  } catch {
    return fail("generic");
  }
}

// ---------- outcome ----------
export async function logOutcome(id: number, outcome: string, reason: string, lesson: string): Promise<Result<{ pack: Pack }>> {
  const ctx = load(id);
  if (!ctx) return fail("notFound");
  if (!isOutcome(outcome)) return fail("invalid");
  try {
    setPack(id, { outcome, outcome_reason: clamp(reason, 500), lesson: clamp(lesson, 500), outcome_at: new Date().toISOString() });
    if (outcome === "rejected" && ctx.app.status !== "rejected") updateApplication(id, { status: "rejected" });
    if (outcome === "offer" && !["offer", "hired"].includes(ctx.app.status)) updateApplication(id, { status: "offer" });
    if (outcome !== "offer") completeFollowups(id);
    const { t } = await getDict();
    logEvent(id, "note", `${t.apply2.outcome.outcomes[outcome]}${reason ? ` — ${clamp(reason, 200)}` : ""}`);
    refresh();
    return { ok: true, pack: getPack(id) };
  } catch {
    return fail("generic");
  }
}

// ---------- liveness ----------
/** HEAD/GET the posting URL with a short timeout. null = cannot tell (manual posting or offline). */
export async function checkPostingAlive(id: number): Promise<Result<{ alive: boolean | null; status: number }>> {
  const ctx = load(id);
  if (!ctx) return fail("notFound");
  const url = ctx.job.url;
  if (!/^https?:\/\//i.test(url)) return { ok: true, alive: null, status: 0 };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctl.signal });
    if (res.status === 405 || res.status === 403) res = await fetch(url, { method: "GET", redirect: "follow", signal: ctl.signal });
    return { ok: true, alive: res.status < 400, status: res.status };
  } catch {
    return { ok: true, alive: null, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}
