"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addEvent, getApplication, getJob, getProfile } from "@/lib/db";
import { getLocale } from "@/lib/i18n/server";
import { BANK, BANK_BY_ID, type Lang, type Level, type Track } from "@/lib/coach/bank";
import { aggregate, inferTrack, isTrack, KINDS, LENGTHS, nextDrillState, selectQuestions, stems, toSessionQuestion, type DrillGrade, type Kind, type StoryInput } from "@/lib/coach/logic";
import { generateJobQuestions, polishStory } from "@/lib/ai/coach";
import { DEBRIEF_ROUNDS, debriefFeedback, RATINGS, type DebriefRound, type Rating } from "@/lib/ai/debrief";
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

// ---------- debrief (real interview) ----------
export interface DebriefForm {
  application: number | null;
  interview: number | null;
  round: string;
  interviewer: string;
  outcome: string;
  competencies: string[];
  questions: { question: string; rating: string; notes: string; competency: string }[];
  retracted: string[];
}

/** Save a debrief, generate feedback, and push weak questions into the drill deck (matched bank cards come due now). */
export async function saveDebrief(f: DebriefForm): Promise<{ id?: number; drilled?: number; error?: string }> {
  const round = DEBRIEF_ROUNDS.includes(f?.round as DebriefRound) ? (f.round as DebriefRound) : null;
  const questions = (Array.isArray(f?.questions) ? f.questions : [])
    .map((q) => ({ question: clip(q?.question, 400), rating: (RATINGS.includes(q?.rating as Rating) ? q.rating : "yellow") as Rating, notes: clip(q?.notes, 1500), competency: clip(q?.competency, 40) }))
    .filter((q) => q.question)
    .slice(0, 20);
  if (!round || !questions.length) return { error: "invalid" };
  const app = int(f.application) ? getApplication(int(f.application)!) : null;
  const job = app ? getJob(app.job_id) : null;
  const locale = await getLocale();
  const input = { company: job?.company ?? "", role: job?.title ?? "", round, questions, retracted: list(f.retracted).map((r) => r.slice(0, 40)), locale };
  const retracted = (Array.isArray(f.retracted) ? f.retracted : []).map((r) => clip(r, 200)).filter(Boolean).slice(0, 10);
  const fb = await debriefFeedback(getProfile().settings, { ...input, retracted });
  const id = repo.createDebrief({
    application_id: app?.id ?? null,
    interview_id: int(f.interview),
    company: input.company,
    role: input.role,
    round,
    interviewer: clip(f.interviewer, 120),
    outcome: (["pending", "forward", "rejected"] as const).find((o) => o === f.outcome) ?? "pending",
    competencies: list(f.competencies),
    questions,
    retracted,
    feedback: fb.text,
    engine: fb.engine,
  });
  // Weak questions → drill: the closest bank card (keyword overlap) is reset to box 1, due now.
  // ponytail: bank match only; questions with no bank twin stay in the debrief, add custom cards when the drill reads them.
  const states = repo.drillStates();
  const now = new Date();
  let drilled = 0;
  for (const q of questions.filter((x) => x.rating !== "green")) {
    const qs = new Set(stems(q.question));
    let best: { id: string; hits: number } | null = null;
    for (const b of BANK) {
      if (b.type !== "technical") continue;
      const hits = [...new Set(stems(`${b.fr} ${b.en}`))].filter((w) => qs.has(w)).length;
      if (hits >= 2 && (!best || hits > best.hits)) best = { id: b.id, hits };
    }
    if (best) {
      repo.saveDrillState(nextDrillState(states.get(best.id) ?? null, best.id, q.rating === "red" ? "no" : "partial", now));
      drilled++;
    }
  }
  if (app) addEvent(app.id, "note", `${locale === "fr" ? "Débrief d'entretien" : "Interview debrief"} (${round}) → /app/coach/debrief/${id}`);
  revalidatePath("/app/coach");
  revalidatePath("/app/coach/debrief");
  return { id, drilled };
}

export async function deleteDebriefAction(id: number): Promise<void> {
  repo.deleteDebrief(Number(id));
  revalidatePath("/app/coach/debrief");
  redirect("/app/coach/debrief");
}

// ---------- drill ----------
export async function gradeDrill(questionId: string, grade: DrillGrade): Promise<{ ok: boolean }> {
  if (!BANK_BY_ID.has(String(questionId)) || !["knew", "partial", "no"].includes(grade)) return { ok: false };
  const prev = repo.drillStates().get(questionId) ?? null;
  repo.saveDrillState(nextDrillState(prev, questionId, grade, new Date()));
  return { ok: true };
}
