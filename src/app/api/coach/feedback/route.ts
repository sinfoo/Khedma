// POST { sessionId, idx, answer, seconds } → streamed Markdown feedback (text/plain).
// Rubric scores are computed and saved before streaming and sent in the `x-coach-score` header;
// the streamed text is saved to the answer once complete. `x-engine` says which engine wrote it.
import { getApplication, getJob, getProfile } from "@/lib/db";
import { aiStreamResponse } from "@/lib/ai";
import { extractSkills } from "@/lib/ai/heuristic";
import { cvTerms, feedbackMessages, heuristicFeedback, postingSkills } from "@/lib/ai/coach";
import { scoreAnswer } from "@/lib/coach/logic";
import { getSession, saveAnswer, setFeedback } from "@/lib/repo/coach";

const bad = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad(400, "invalid json");
  }
  const sessionId = Number(body.sessionId);
  const idx = Number(body.idx);
  const answer = typeof body.answer === "string" ? body.answer.slice(0, 6000) : "";
  const seconds = Math.max(0, Math.min(3600, Math.round(Number(body.seconds) || 0)));
  if (!Number.isInteger(sessionId) || !Number.isInteger(idx) || idx < 0) return bad(400, "invalid session or index");
  if (answer.trim().split(/\s+/).filter(Boolean).length < 2) return bad(400, "answer too short");

  const session = getSession(sessionId);
  if (!session) return bad(404, "session not found");
  if (session.status !== "active") return bad(409, "session finished");
  const question = session.questions[idx];
  if (!question) return bad(404, "question not found");

  const app = session.application_id ? getApplication(session.application_id) : null;
  const job = app ? getJob(app.job_id) : null;
  const profile = getProfile();
  const result = scoreAnswer({ answer, question, postingSkills: postingSkills(job), skillsIn: extractSkills, cvTerms: cvTerms(profile) });
  saveAnswer(session.id, { idx, question_id: question.id, answer, seconds, skipped: false, scores: result.scores, overall: result.overall, tips: result.tips });

  const ctx = { question, answer, lang: session.lang, job, profile, result };
  const res = await aiStreamResponse(profile.settings, feedbackMessages(ctx), () => heuristicFeedback(ctx));
  const engine = res.headers.get("x-engine") ?? "heuristic";

  // Pass chunks through untouched while keeping a copy to persist at the end.
  const dec = new TextDecoder();
  let full = "";
  const tee = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      full += dec.decode(chunk, { stream: true });
      ctrl.enqueue(chunk);
    },
    flush() {
      full += dec.decode();
      setFeedback(session.id, idx, full.trim(), engine);
    },
  });
  const headers = new Headers(res.headers);
  headers.set("x-coach-score", JSON.stringify({ ...result.scores, overall: result.overall }));
  return new Response(res.body!.pipeThrough(tee), { status: 200, headers });
}
