// Public AI API: try Ollama, validate its output, fall back to heuristics.
import type { Evaluation, InterviewPrep, Job, Locale, Profile, Settings, UpskillPlan } from "../types";
import {
  computeSkillGaps,
  detectLanguage,
  heuristicCoverLetter,
  heuristicEvaluate,
  heuristicInterviewPrep,
  heuristicTailorCv,
  heuristicUpskillPlan,
  verdictFor,
} from "./heuristic";
import { ollamaChatJSON, ollamaChatStream, ollamaChatText, ollamaHealth, type ChatMessage } from "./ollama";
import { coverLetterPrompt, evaluatePrompt, interviewPrompt, tailorCvPrompt, upskillPrompt, type Prompt } from "./prompts";

export { detectLanguage, computeSkillGaps };

interface Engine {
  url: string;
  model: string;
  label: string;
}

/** Health-check and pick a model: the configured one if installed, else the first installed. */
export async function pickEngine(settings: Settings): Promise<{ engine: Engine | null; models: string[] }> {
  const h = await ollamaHealth(settings.ollama_url);
  if (!h.ok || h.models.length === 0) return { engine: null, models: h.models };
  const want = settings.ollama_model;
  const model = h.models.find((m) => m === want || m.split(":")[0] === want) ?? h.models[0];
  return { engine: { url: settings.ollama_url, model, label: `ollama:${model}` }, models: h.models };
}

export async function getEngine(settings: Settings): Promise<{ online: boolean; label: string; models: string[] }> {
  const { engine, models } = await pickEngine(settings);
  return { online: !!engine, label: engine?.label ?? "heuristic", models };
}

/** Run a prompt through Ollama and shape the result; null on any failure so the caller falls back. */
export async function tryOllama<T>(settings: Settings, prompt: Prompt, shape: (raw: unknown, label: string) => T): Promise<T | null> {
  const { engine } = await pickEngine(settings);
  if (!engine) return null;
  try {
    const raw = await ollamaChatJSON<unknown>({ url: engine.url, model: engine.model, ...prompt });
    return shape(raw, engine.label);
  } catch (e) {
    console.warn(`[ai] ${engine.label} failed, using heuristic:`, (e as Error).message);
    return null;
  }
}

// ---------- coercion helpers ----------
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
const score = (x: unknown, fallback = 3) => {
  const n = Number(x);
  return Math.round(Math.min(5, Math.max(1, Number.isFinite(n) ? n : fallback)) * 10) / 10;
};
const strs = (x: unknown, max = 8) =>
  (Array.isArray(x) ? x : []).map((s) => String(s ?? "").trim().slice(0, 160)).filter(Boolean).slice(0, max);
const text = (x: unknown) => String(x ?? "").trim();
/** Remove a single wrapping ```fence``` if the model added one. */
const stripFences = (md: string) => md.replace(/^\s*```[\w-]*\s*\n([\s\S]*?)\n\s*```\s*$/, "$1").trim();

// ---------- public API ----------
export async function evaluateJob(job: Job, profile: Profile): Promise<Omit<Evaluation, "id" | "created_at">> {
  const locale = profile.settings.locale;
  const fromOllama = await tryOllama(profile.settings, evaluatePrompt(job, profile, locale), (raw, label) => {
    const r = obj(raw);
    if (r.global === undefined && r.match === undefined) throw new Error("missing scores");
    const global = score(r.global);
    const verdicts: Evaluation["verdict"][] = ["apply_now", "apply", "maybe", "skip"];
    const verdict = verdicts.includes(r.verdict as Evaluation["verdict"]) ? (r.verdict as Evaluation["verdict"]) : verdictFor(global);
    return {
      job_id: job.id,
      global,
      match: score(r.match),
      target: score(r.target),
      growth: score(r.growth),
      culture: score(r.culture),
      red_flags: score(r.red_flags, 5),
      strengths: strs(r.strengths),
      gaps: strs(r.gaps),
      flags: strs(r.flags),
      verdict,
      summary: text(r.summary).slice(0, 600),
      engine: label,
    };
  });
  return fromOllama ?? { job_id: job.id, ...heuristicEvaluate(job, profile) };
}

async function markdownTask(settings: Settings, prompt: Prompt, fallback: () => string): Promise<{ md: string; engine: string }> {
  const r = await tryOllama(settings, prompt, (raw, label) => {
    const md = stripFences(text(obj(raw).md));
    if (md.length < 40) throw new Error("empty markdown");
    return { md, engine: label };
  });
  return r ?? { md: fallback(), engine: "heuristic" };
}

export function tailorCv(job: Job, profile: Profile, locale: Locale) {
  return markdownTask(profile.settings, tailorCvPrompt(job, profile, locale), () => heuristicTailorCv(job, profile, locale));
}

export function writeCoverLetter(job: Job, profile: Profile, locale: Locale) {
  return markdownTask(profile.settings, coverLetterPrompt(job, profile, locale), () => heuristicCoverLetter(job, profile, locale));
}

export async function prepareInterview(job: Job, profile: Profile, locale: Locale): Promise<InterviewPrep> {
  const r = await tryOllama(profile.settings, interviewPrompt(job, profile, locale), (raw, label) => {
    const o = obj(raw);
    const likely_questions = (Array.isArray(o.likely_questions) ? o.likely_questions : [])
      .map((q) => ({ question: text(obj(q).question), why: text(obj(q).why), approach: text(obj(q).approach) }))
      .filter((q) => q.question)
      .slice(0, 10);
    const star_stories = (Array.isArray(o.star_stories) ? o.star_stories : [])
      .map((s) => {
        const x = obj(s);
        return { title: text(x.title), situation: text(x.situation), task: text(x.task), action: text(x.action), result: text(x.result) };
      })
      .filter((s) => s.title)
      .slice(0, 5);
    if (likely_questions.length < 3) throw new Error("too few questions");
    return { pitch: text(o.pitch), likely_questions, star_stories, questions_to_ask: strs(o.questions_to_ask, 8), engine: label };
  });
  return r ?? heuristicInterviewPrep(job, profile, locale);
}

export async function buildUpskillPlan(jobs: Job[], profile: Profile, locale: Locale): Promise<UpskillPlan> {
  const gaps = computeSkillGaps(jobs, profile);
  const r = await tryOllama(profile.settings, upskillPrompt(gaps, profile, locale), (raw, label) => {
    const plan = (Array.isArray(obj(raw).plan) ? (obj(raw).plan as unknown[]) : [])
      .map((p) => {
        const x = obj(p);
        const pr = Math.round(Number(x.priority));
        return {
          skill: text(x.skill).slice(0, 80),
          priority: (pr >= 1 && pr <= 3 ? pr : 2) as 1 | 2 | 3,
          why: text(x.why).slice(0, 300),
          steps: strs(x.steps, 6),
          resources: (Array.isArray(x.resources) ? x.resources : [])
            .map((res) => ({ title: text(obj(res).title).slice(0, 120), url: text(obj(res).url) }))
            .filter((res) => /^https?:\/\//.test(res.url))
            .slice(0, 4),
        };
      })
      .filter((p) => p.skill)
      .slice(0, 6);
    if (!plan.length) throw new Error("empty plan");
    return { gaps, plan, engine: label, created_at: new Date().toISOString() };
  });
  return r ?? heuristicUpskillPlan(gaps, locale);
}

// ---------- generic helpers for feature modules (src/lib/ai/<feature>.ts) ----------
export type { ChatMessage, Prompt };

/** Structured task: Ollama with a JSON schema, shaped/validated, else the deterministic fallback. */
export async function aiJSON<T>(
  settings: Settings,
  prompt: Prompt,
  shape: (raw: unknown, engineLabel: string) => T,
  fallback: () => T,
): Promise<T> {
  return (await tryOllama(settings, prompt, shape)) ?? fallback();
}

/** Free-text task (markdown, emails…). Returns the text and which engine produced it. */
export async function aiText(
  settings: Settings,
  messages: ChatMessage[],
  fallback: () => string,
): Promise<{ text: string; engine: string }> {
  const { engine } = await pickEngine(settings);
  if (engine) {
    try {
      const text = stripFences(await ollamaChatText({ url: engine.url, model: engine.model, messages }));
      if (text.trim()) return { text, engine: engine.label };
    } catch (e) {
      console.warn(`[ai] ${engine.label} failed, using heuristic:`, (e as Error).message);
    }
  }
  return { text: fallback(), engine: "heuristic" };
}

/**
 * Streaming chat for route handlers: returns a text/plain streaming Response.
 * The `x-engine` header says which engine answered. Falls back to a single
 * heuristic chunk when Ollama is offline or fails before the first token.
 */
export async function aiStreamResponse(settings: Settings, messages: ChatMessage[], fallback: () => string): Promise<Response> {
  const { engine } = await pickEngine(settings);
  const enc = new TextEncoder();
  const headers = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" };
  if (engine) {
    try {
      const it = ollamaChatStream({ url: engine.url, model: engine.model, messages });
      const first = await it.next();
      const body = new ReadableStream<Uint8Array>({
        async start(ctrl) {
          try {
            if (!first.done) ctrl.enqueue(enc.encode(first.value));
            for await (const chunk of it) ctrl.enqueue(enc.encode(chunk));
          } catch (e) {
            ctrl.enqueue(enc.encode(`

[${(e as Error).message}]`));
          }
          ctrl.close();
        },
      });
      return new Response(body, { headers: { ...headers, "x-engine": engine.label } });
    } catch (e) {
      console.warn(`[ai] ${engine.label} stream failed, using heuristic:`, (e as Error).message);
    }
  }
  return new Response(fallback(), { headers: { ...headers, "x-engine": "heuristic" } });
}
