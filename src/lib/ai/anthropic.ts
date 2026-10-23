// Thin client for the Claude Messages API. No SDK: three calls via fetch.
// The key is read from the environment only (.env.local, gitignored) and never stored or returned.
import type { ChatMessage } from "./ollama";

const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

export class ClaudeUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeUnavailable";
  }
}

export function claudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

function headers() {
  return {
    "content-type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY!.trim(),
    "anthropic-version": VERSION,
  };
}

/** Claude takes the system prompt separately from the turns. */
function split(messages: ChatMessage[]) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const turns = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
  return { system: system || undefined, turns };
}

async function post(body: object, timeoutMs: number): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(API, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new ClaudeUnavailable(`Claude API unreachable: ${(e as Error).message}`);
  }
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    // 401/403: bad key; 429/529: rate limit/overload. Callers fall back either way.
    throw new ClaudeUnavailable(`Claude API HTTP ${r.status}: ${text.slice(0, 200)}`);
  }
  return r;
}

/**
 * A prompt schema made acceptable to structured outputs: numeric/string/array bounds are not supported there
 * (our callers clamp values themselves) and every object must close with `additionalProperties: false`.
 */
export function strictSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(strictSchema);
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems", "uniqueItems"].includes(k)) continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([p, ps]) => [p, strictSchema(ps)])) : strictSchema(v);
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

type Reply = { stop_reason?: string; content?: { type: string; text?: string }[] };

/** Text of a reply; a refusal or a reply cut at max_tokens is an error, so callers fall back instead of using half an answer. */
function replyText(data: Reply): string {
  if (data.stop_reason === "refusal") throw new ClaudeUnavailable("Claude declined this request");
  if (data.stop_reason === "max_tokens") throw new Error("Claude reply truncated at max_tokens");
  return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}

// Thinking is on by default on current models and counts against max_tokens: leave room for it.
// ponytail: 16000 is the non-streaming ceiling that stays clear of HTTP timeouts; stream if outputs ever need more.
const MAX_TOKENS = 16_000;

/** Structured output (output_config.format): the reply is JSON that matches the schema. */
export async function claudeJSON<T>(opts: { model: string; system: string; user: string; schema: object; timeoutMs?: number }): Promise<T> {
  const r = await post(
    {
      model: opts.model,
      max_tokens: MAX_TOKENS,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      output_config: { format: { type: "json_schema", schema: strictSchema(opts.schema) } },
    },
    opts.timeoutMs ?? 120_000,
  );
  const text = replyText((await r.json()) as Reply);
  if (!text.trim()) throw new Error("Claude returned no structured result");
  return JSON.parse(text) as T;
}

// No temperature: current Claude models reject it; defaults are fine for these tasks.
export async function claudeText(opts: { model: string; messages: ChatMessage[]; timeoutMs?: number }): Promise<string> {
  const { system, turns } = split(opts.messages);
  const r = await post(
    { model: opts.model, max_tokens: MAX_TOKENS, system, messages: turns },
    opts.timeoutMs ?? 120_000,
  );
  return replyText((await r.json()) as Reply);
}

/** Streaming text: parses server-sent events and yields text deltas. */
export async function* claudeStream(opts: { model: string; messages: ChatMessage[]; timeoutMs?: number }): AsyncGenerator<string> {
  const { system, turns } = split(opts.messages);
  const r = await post(
    { model: opts.model, max_tokens: MAX_TOKENS, system, messages: turns, stream: true },
    opts.timeoutMs ?? 300_000,
  );
  if (!r.body) return;
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const ev = JSON.parse(line.slice(5)) as { type: string; delta?: { type?: string; text?: string }; error?: { message?: string } };
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) yield ev.delta.text;
      else if (ev.type === "error") throw new Error(ev.error?.message ?? "Claude stream error");
      else if (ev.type === "message_stop") return;
    }
  }
}

let healthCache: { at: number; ok: boolean } | null = null;
/** Cheap key check (GET /v1/models), cached 10 minutes so page loads stay fast. */
export async function claudeHealth(): Promise<boolean> {
  if (!claudeConfigured()) return false;
  if (healthCache && Date.now() - healthCache.at < 600_000) return healthCache.ok;
  let ok = false;
  try {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: headers(), signal: AbortSignal.timeout(4000) });
    ok = r.ok;
  } catch {
    ok = false;
  }
  healthCache = { at: Date.now(), ok };
  return ok;
}
