// Public AI API: try Claude (if a key is configured), then Ollama, validate the output, fall back to heuristics.
import { COMPANY_TYPES, type CompanyType, type Evaluation, type InterviewPrep, type Job, type Locale, type Profile, type Settings, type UpskillPlan } from "../types";
import { heuristicV2Fields, shapeRequirements } from "./eval-v2";
import {
  computeSkillGaps,
  detectLanguage,
  heuristicCoverLetter,
  heuristicEvaluate,
  heuristicInterviewPrep,
  heuristicTailorCv,
  heuristicUpskillPlan,
  cautiousVerdict,
  verdictFor,
} from "./heuristic";
import { ollamaChatJSON, ollamaChatStream, ollamaChatText, ollamaHealth, type ChatMessage } from "./ollama";
import { claudeHealth, claudeJSON, claudeStream, claudeText } from "./anthropic";
import { coverLetterPrompt, evaluatePrompt, interviewPrompt, tailorCvPrompt, upskillPrompt, type DocCtx, type Prompt } from "./prompts";
import { applyGates, type Gate } from "./gates";

export { detectLanguage, computeSkillGaps };

interface Engine {
  kind: "claude" | "ollama";
  url: string;
  model: string;
  label: string;
}

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";

/**
 * Pick the engine for this call, honouring settings.provider:
 * "auto" = Claude if a working key is configured, else Ollama, else heuristic.
 */
export async function pickEngine(settings: Settings): Promise<{ engine: Engine | null; models: string[] }> {
  const provider = settings.provider ?? "auto";
  if (provider === "offline") return { engine: null, models: [] };
  if ((provider === "auto" || provider === "claude") && (await claudeHealth())) {
    const model = settings.claude_model || DEFAULT_CLAUDE_MODEL;
    return { engine: { kind: "claude", url: "", model, label: `claude:${model}` }, models: [] };
  }
  if (provider === "claude") return { engine: null, models: [] };
  const h = await ollamaHealth(settings.ollama_url);
  if (!h.ok || h.models.length === 0) return { engine: null, models: h.models };
  const want = settings.ollama_model;
  const model = h.models.find((m) => m === want || m.split(":")[0] === want) ?? h.models[0];
  return { engine: { kind: "ollama", url: settings.ollama_url, model, label: `ollama:${model}` }, models: h.models };
}

const runJSON = (e: Engine, prompt: Prompt) =>
  e.kind === "claude" ? claudeJSON<unknown>({ model: e.model, ...prompt }) : ollamaChatJSON<unknown>({ url: e.url, model: e.model, ...prompt });
const runText = (e: Engine, messages: ChatMessage[]) =>
  e.kind === "claude" ? claudeText({ model: e.model, messages }) : ollamaChatText({ url: e.url, model: e.model, messages });
const runStream = (e: Engine, messages: ChatMessage[]) =>
  e.kind === "claude" ? claudeStream({ model: e.model, messages }) : ollamaChatStream({ url: e.url, model: e.model, messages });

export async function getEngine(settings: Settings): Promise<{ online: boolean; label: string; models: string[] }> {
  const { engine, models } = await pickEngine(settings);
  return { online: !!engine, label: engine?.label ?? "heuristic", models };
}

/** Run a prompt through the picked engine and shape the result; null on any failure so the caller falls back. */
export async function tryOllama<T>(settings: Settings, prompt: Prompt, shape: (raw: unknown, label: string) => T): Promise<T | null> {
  const { engine } = await pickEngine(settings);
  if (!engine) return null;
  try {
    const raw = await runJSON(engine, prompt);
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
/** `gates`: eligibility gates for this offer (see gates.ts); a failed one vetoes the verdict whatever the score. */
export async function evaluateJob(job: Job, profile: Profile, gates: Gate[] = []): Promise<Omit<Evaluation, "id" | "created_at">> {
  const locale = profile.settings.locale;
  // Legitimacy, comp reliability and the deterministic defaults never come from the model.
  const v2 = heuristicV2Fields(job, profile);
  const fromOllama = await tryOllama(profile.settings, evaluatePrompt(job, profile, locale), (raw, label) => {
    const r = obj(raw);
    if (r.global === undefined && r.match === undefined) throw new Error("missing scores");
    const global = score(r.global);
    const verdicts: Evaluation["verdict"][] = ["apply_now", "apply", "maybe", "skip"];
    const said = verdicts.includes(r.verdict as Evaluation["verdict"]) ? (r.verdict as Evaluation["verdict"]) : verdictFor(global);
    const verdict = cautiousVerdict(said, verdictFor(global));
    const requirements = shapeRequirements(r.requirements, `${profile.skills.join(", ")}\n${profile.cv_md}`);
    const cvChanges = strs(r.cv_changes, 5).map((s) => s.slice(0, 160));
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
      ...v2,
      requirements: requirements.length ? requirements : v2.requirements,
      archetype: text(r.archetype).slice(0, 40) || v2.archetype,
      level_plan: text(r.level_plan).slice(0, 600) || v2.level_plan,
      cv_changes: cvChanges.length ? cvChanges : v2.cv_changes,
      company_type: (COMPANY_TYPES as readonly string[]).includes(String(r.company_type)) ? (r.company_type as CompanyType) : v2.company_type,
    };
  });
  return applyGates(fromOllama ?? { job_id: job.id, ...heuristicEvaluate(job, profile), ...v2 }, gates, locale === "fr");
}

async function markdownTask(settings: Settings, prompt: Prompt, fallback: () => string): Promise<{ md: string; engine: string }> {
  const r = await tryOllama(settings, prompt, (raw, label) => {
    const md = stripFences(text(obj(raw).md));
    if (md.length < 40) throw new Error("empty markdown");
    return { md, engine: label };
  });
  return r ?? { md: fallback(), engine: "heuristic" };
}

export function tailorCv(job: Job, profile: Profile, locale: Locale, ctx: DocCtx = {}) {
  return markdownTask(profile.settings, tailorCvPrompt(job, profile, locale, ctx), () => heuristicTailorCv(job, profile, locale));
}

export function writeCoverLetter(job: Job, profile: Profile, locale: Locale, ctx: DocCtx = {}) {
  return markdownTask(profile.settings, coverLetterPrompt(job, profile, locale, ctx), () => heuristicCoverLetter(job, profile, locale));
}

export async function prepareInterview(job: Job, profile: Profile, locale: Locale, ctx: DocCtx = {}): Promise<InterviewPrep> {
  const r = await tryOllama(profile.settings, interviewPrompt(job, profile, locale, ctx), (raw, label) => {
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
      const text = stripFences(await runText(engine, messages));
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
      const it = runStream(engine, messages);
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
