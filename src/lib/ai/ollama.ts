// Thin client for a local Ollama server. No dependencies, no retries.

/** Thrown when the server cannot be reached at all (offline, timeout). */
export class OllamaUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaUnavailable";
  }
}

const base = (url: string) => url.replace(/\/+$/, "");

export async function ollamaHealth(url: string): Promise<{ ok: boolean; models: string[]; version?: string }> {
  try {
    const r = await fetch(`${base(url)}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return { ok: false, models: [] };
    const data = (await r.json()) as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name);
    let version: string | undefined;
    try {
      const v = await fetch(`${base(url)}/api/version`, { signal: AbortSignal.timeout(2000) });
      if (v.ok) version = ((await v.json()) as { version?: string }).version;
    } catch {
      // version is optional
    }
    return { ok: true, models, version };
  } catch {
    return { ok: false, models: [] };
  }
}

export async function ollamaChatJSON<T>(opts: {
  url: string;
  model: string;
  system: string;
  user: string;
  schema: object;
  timeoutMs?: number;
}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${base(opts.url)}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
      body: JSON.stringify({
        model: opts.model,
        stream: false,
        format: opts.schema,
        options: { temperature: 0.2 },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });
  } catch (e) {
    throw new OllamaUnavailable(`Ollama unreachable at ${opts.url}: ${(e as Error).message}`);
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Ollama HTTP ${r.status}: ${body.slice(0, 300)}`);
  }
  const data = (await r.json()) as { message?: { content?: string } };
  const content = data.message?.content ?? "";
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error(`Ollama returned invalid JSON: ${content.slice(0, 300)}`);
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function post(url: string, body: object, timeoutMs: number): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(`${base(url)}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new OllamaUnavailable(`Ollama unreachable at ${url}: ${(e as Error).message}`);
  }
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Ollama HTTP ${r.status}: ${text.slice(0, 300)}`);
  }
  return r;
}

/** One-shot free-text completion. */
export async function ollamaChatText(opts: { url: string; model: string; messages: ChatMessage[]; temperature?: number; timeoutMs?: number }): Promise<string> {
  const r = await post(
    opts.url,
    { model: opts.model, stream: false, options: { temperature: opts.temperature ?? 0.4 }, messages: opts.messages },
    opts.timeoutMs ?? 180_000,
  );
  const data = (await r.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

/** Streaming completion: yields text deltas as Ollama produces them (NDJSON). */
export async function* ollamaChatStream(opts: { url: string; model: string; messages: ChatMessage[]; temperature?: number; timeoutMs?: number }): AsyncGenerator<string> {
  const r = await post(
    opts.url,
    { model: opts.model, stream: true, options: { temperature: opts.temperature ?? 0.5 }, messages: opts.messages },
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
      if (!line) continue;
      const msg = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
      if (msg.message?.content) yield msg.message.content;
      if (msg.done) return;
    }
  }
}
