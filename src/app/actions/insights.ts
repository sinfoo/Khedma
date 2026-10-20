"use server";

import { revalidatePath } from "next/cache";
import { addEvent, ensureApplication, getApplication, getJob, getProfile, insertEvaluation, listJobs } from "@/lib/db";
import { evaluateJob } from "@/lib/ai";
import { eligibilityGates } from "@/lib/ai/gates";
import { outcomeCalibration } from "@/lib/repo/evaluations";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { addReminder, setReminderDone, setWeeklyGoal } from "@/lib/repo/insights";

const id = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function addReminderAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const title = String(fd.get("title") ?? "").trim().slice(0, 200);
  const date = String(fd.get("date") ?? "");
  const time = String(fd.get("time") ?? "");
  if (!title) return { ok: false, error: "title" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) return { ok: false, error: "date" };
  const jobId = id(fd.get("job_id"));
  const job = jobId ? getJob(jobId) : null;
  addReminder({
    title,
    due_at: /^\d{2}:\d{2}$/.test(time) ? `${date}T${time}` : date,
    job_id: job?.id ?? null,
  });
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function setReminderDoneAction(reminderId: number, done: boolean) {
  const rid = id(reminderId);
  if (!rid) return;
  setReminderDone(rid, !!done);
  revalidatePath("/app", "layout");
}

export async function saveWeeklyGoal(n: number) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  setWeeklyGoal(Math.min(30, Math.max(1, v)));
  revalidatePath("/app");
}

/** Track an offer without leaving the page (the offers page has its own redirecting variant). */
export async function trackOffer(jobId: number): Promise<number | null> {
  const jid = id(jobId);
  if (!jid || !getJob(jid)) return null;
  const app = ensureApplication(jid);
  revalidatePath("/app", "layout");
  return app.id;
}

export async function logFollowup(appId: number) {
  const aid = id(appId);
  if (!aid || !getApplication(aid)) return;
  addEvent(aid, "followup", "");
  revalidatePath("/app", "layout");
}

/** Score up to 5 unscored offers (Ollama when available, heuristic otherwise). */
export async function evaluatePending(): Promise<number> {
  const profile = getProfile();
  const todo = listJobs().filter((j) => !j.evaluation).slice(0, 5);
  const calibration = outcomeCalibration();
  let n = 0;
  for (const j of todo) {
    try {
      insertEvaluation(await evaluateJob(j, profile, eligibilityGates(j, profile, getProfileExtra().langs), calibration));
      n++;
    } catch (e) {
      console.warn("[evaluate] skipped", j.id, (e as Error).message);
    }
  }
  revalidatePath("/app", "layout");
  return n;
}
