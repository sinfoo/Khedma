"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getApplication, getJob, getProfile } from "@/lib/db";
import { getLocale } from "@/lib/i18n/server";
import { BANK, BANK_BY_ID, type Lang, type Level, type Track } from "@/lib/coach/bank";
import { aggregate, inferTrack, isTrack, KINDS, LENGTHS, nextDrillState, selectQuestions, toSessionQuestion, type DrillGrade, type Kind, type StoryInput } from "@/lib/coach/logic";
import { generateJobQuestions, polishStory } from "@/lib/ai/coach";
import * as repo from "@/lib/repo/coach";

const int = (x: unknown) => {
  const n = Number(x);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function startSession(_prev: { error?: string } | null, form: FormData): Promise<{ error?: string }> {
  const lang: Lang = form.get("lang") === "en" ? "en" : "fr";
  const kind = KINDS.includes(form.get("kind") as Kind) ? (form.get("kind") as Kind) : null;
  const length = LENGTHS.find((n) => n === Number(form.get("length")));
  const lvl = Number(form.get("level"));
  const level = ([1, 2, 3] as const).find((n) => n === lvl) as Level | undefined;
  if (!kind || !length || !level) return { error: "invalid" };

  const profile = getProfile();
  let track: Track;
  let title: string;
  let applicationId: number | null = null;
  let posting: Awaited<ReturnType<typeof generateJobQuestions>> | null = null;

  if (form.get("source") === "app") {
    const app = getApplication(int(form.get("application")) ?? 0);
    const job = app && getJob(app.job_id);
    if (!app || !job) return { error: "invalid" };
    applicationId = app.id;
    track = inferTrack(job.title, job.description, job.type);
    title = `${job.title} · ${job.company}`;
    posting = await generateJobQuestions(job, profile, lang);
    // Keep posting questions that fit the interview type.
    posting.questions = posting.questions
      .filter((q) => (kind === "technical" ? q.type === "technical" : kind === "hr" ? q.type !== "technical" : true))
      .slice(0, 2);
  } else {
    const tr = form.get("track");
    if (!isTrack(tr)) return { error: "invalid" };
    track = tr;
    title = "";
  }

  const extra = posting?.questions ?? [];
  const questions = selectQuestions(BANK, { track, kind, level, count: length - extra.length, exclude: repo.recentQuestionIds(3) }).map((q) =>
    toSessionQuestion(q, lang),
  );
  // Posting questions go after the opener and around the middle.
  if (extra[0]) questions.splice(1, 0, extra[0]);
  if (extra[1]) questions.splice(Math.ceil(questions.length / 2), 0, extra[1]);

  const id = repo.createSession({
    application_id: applicationId,
    title,
    track,
    kind,
    lang,
    level,
    questions,
    engine: posting?.engine ?? "heuristic",
  });
  revalidatePath("/app/coach");
  redirect(`/app/coach/${id}`);
}

export async function skipQuestion(sessionId: number, idx: number): Promise<void> {
  const s = repo.getSession(Number(sessionId));
  const q = s?.questions[Number(idx)];
  if (!s || !q || s.status !== "active") return;
  repo.saveAnswer(s.id, { idx: Number(idx), question_id: q.id, answer: "", seconds: 0, skipped: true, scores: null, overall: null, tips: [] });
}

export async function endSession(sessionId: number): Promise<void> {
  const s = repo.getSession(Number(sessionId));
  if (!s) return;
  const agg = aggregate(repo.listAnswers(s.id));
  repo.finishSession(s.id, agg.overall, agg.answered ? agg.dims : null);
  revalidatePath("/app/coach");
  redirect(`/app/coach/${s.id}`);
}

export async function deleteCoachSession(sessionId: number): Promise<void> {
  repo.deleteSession(Number(sessionId));
  revalidatePath("/app/coach");
  redirect("/app/coach");
}

// ---------- stories ----------
const clip = (x: unknown, n: number) => String(x ?? "").trim().slice(0, n);
const list = (x: unknown) =>
  (Array.isArray(x) ? x : [])
    .map((s) => clip(s, 40))
    .filter(Boolean)
    .slice(0, 12);
function cleanStory(x: unknown): StoryInput {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  return {
    title: clip(o.title, 120),
    situation: clip(o.situation, 2000),
    task: clip(o.task, 2000),
    action: clip(o.action, 3000),
    result: clip(o.result, 2000),
    tags: list(o.tags),
    skills: list(o.skills),
  };
}

export async function saveStory(id: number | null, input: StoryInput): Promise<{ id?: number; error?: string }> {
  const s = cleanStory(input);
  if (!s.title || !(s.situation || s.task || s.action || s.result)) return { error: "invalid" };
  const saved = repo.upsertStory(int(id), s);
  revalidatePath("/app/coach/stories");
  return { id: saved };
}

export async function deleteStory(id: number): Promise<void> {
  repo.deleteStory(Number(id));
  revalidatePath("/app/coach/stories");
}

export async function polishStoryDraft(input: StoryInput) {
  const s = cleanStory(input);
  return polishStory(getProfile().settings, s, await getLocale());
}

// ---------- drill ----------
export async function gradeDrill(questionId: string, grade: DrillGrade): Promise<{ ok: boolean }> {
  if (!BANK_BY_ID.has(String(questionId)) || !["knew", "partial", "no"].includes(grade)) return { ok: false };
  const prev = repo.drillStates().get(questionId) ?? null;
  repo.saveDrillState(nextDrillState(prev, questionId, grade, new Date()));
  return { ok: true };
}
