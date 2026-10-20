"use server";

import { revalidatePath } from "next/cache";
import { getApplication, getJob, getProfile } from "@/lib/db";
import { getCvSource } from "@/lib/cv/source";
import { getDict } from "@/lib/i18n/server";
import { fallbackAnswers, generateAnswers, generateFields, type AskedQuestion, type GeneratedAnswer } from "@/lib/ai/apply";
import { QUESTION_LABEL, clampChars, clampLimit, isQuestionId, isSensitiveQuestion } from "@/lib/apply/questions";
import { deleteAnswer as repoDeleteAnswer, getPack, isOutcome, listAnswers, saveAnswer as repoSaveAnswer, setFields, setPack, type Pack } from "@/lib/apply/repo";
import { bumpBankUse, deleteBankAnswer, findBankAnswer, listBank, profileFactAnswer, updateBankAnswer, upsertBankAnswer, type BankAnswer } from "@/lib/apply/bank";
import type { FormFields } from "@/lib/apply/fields";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { applyStageChange, completeFollowups, logEvent } from "@/lib/repo/apps";
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
/**
 * Rules first: sensitive questions get a profile-fact template (never the model, flagged to confirm),
 * questions already answered on another application are reused from the bank, the rest go to the model.
 */
export async function generateFormAnswers(id: number, qids: string[], custom: string[], maxChars: number): Promise<Result<{ answers: GeneratedAnswer[] }>> {
  const ctx = load(id);
  if (!ctx) return fail("notFound");
  const { locale } = await getDict();
  const asked = askedList(qids, custom, locale);
  if (!asked.length) return fail("invalid");
  const profile = getProfile();
  const extra = getProfileExtra();
  const limit = clampLimit(maxChars);
  try {
    const cvText = ctx.app.cv_md?.trim() || getCvSource().text || profile.cv_md;
    const c = { job: ctx.job, profile, cvText, locale, maxChars: limit };
    const done = new Map<string, GeneratedAnswer>();
    const toModel: AskedQuestion[] = [];
    for (const q of asked) {
      if (isSensitiveQuestion(q.qid, q.question)) {
        const fact = q.qid === "availability" || q.qid === "english" || q.qid === "mobility" || q.qid === "salary" ? profileFactAnswer(q.qid, profile, extra, locale) : null;
        const answer = fact ? clampChars(fact.answer, limit) : fallbackAnswers([q], c)[0].answer;
        done.set(q.qid, { ...q, answer, engine: fact && !fact.confirm ? "profile" : "heuristic", confirm: true });
        continue;
      }
      const hit = findBankAnswer(q.question);
      if (hit) {
        bumpBankUse(hit.id);
        done.set(q.qid, { ...q, answer: clampChars(hit.answer, limit), engine: "bank" });
        continue;
      }
      toModel.push(q);
    }
    for (const a of await generateAnswers(toModel, c)) done.set(a.qid, a);
    const answers = asked.map((q) => done.get(q.qid)!);
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
  const text = clamp(answer, 4000);
  repoSaveAnswer({ ...existing, answer: text, max_chars: clampLimit(maxChars), engine: "edited" });
  // An accepted answer joins the global bank, unless placeholders are still unfilled.
  if (text && !/\[[^\]]+\]/.test(text)) upsertBankAnswer({ question: existing.question, answer: text, source_app: id });
  refresh();
  return { ok: true };
}

// ---------- answer bank ----------
export async function listBankAnswers(): Promise<BankAnswer[]> {
  return listBank().map((r) => ({ ...r }));
}

export async function updateBankEntry(bankId: number, answer: string): Promise<Result> {
  if (!okId(bankId)) return fail("invalid");
  const text = clamp(answer, 4000);
  if (!text) return fail("invalid");
  updateBankAnswer(bankId, text);
  return { ok: true };
}

export async function deleteBankEntry(bankId: number): Promise<Result> {
  if (!okId(bankId)) return fail("invalid");
  deleteBankAnswer(bankId);
  return { ok: true };
}

// ---------- form-field artifacts ----------
export async function generateFormFields(id: number): Promise<Result<{ fields: FormFields }>> {
  const ctx = load(id);
  if (!ctx) return fail("notFound");
  const { locale } = await getDict();
  const profile = getProfile();
  try {
    const cvText = ctx.app.cv_md?.trim() || getCvSource().text || profile.cv_md;
    const fields = await generateFields({ job: ctx.job, profile, cvText, locale });
    setFields(id, fields);
    refresh();
    return { ok: true, fields };
  } catch {
    return fail("generic");
  }
}

export async function removeFormAnswer(id: number, qid: string): Promise<Result> {
  if (!load(id)) return fail("notFound");
  repoDeleteAnswer(id, clamp(qid, 60));
  refresh();
  return { ok: true };
}

// ---------- outcome ----------
export async function logOutcome(id: number, outcome: string, reason: string, lesson: string): Promise<Result<{ pack: Pack }>> {
  const ctx = load(id);
  if (!ctx) return fail("notFound");
  if (!isOutcome(outcome)) return fail("invalid");
  try {
    const { t } = await getDict();
    setPack(id, { outcome, outcome_reason: clamp(reason, 500), lesson: clamp(lesson, 500), outcome_at: new Date().toISOString() });
    // Same path as a board move: status event in the timeline, latency stats, follow-ups. No answer closes it.
    const to = outcome === "rejected" ? "rejected" : outcome === "offer" ? (["offer", "hired"].includes(ctx.app.status) ? null : "offer") : ["applied", "responded", "interview"].includes(ctx.app.status) ? "discarded" : null;
    if (to && ctx.app.status !== to) applyStageChange(id, to, t.apps2.reminders.autoFollowup);
    if (outcome !== "offer") completeFollowups(id);
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
