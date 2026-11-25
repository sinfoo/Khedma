// Streaming chat with fetch stubbed: no key, no network, no credit spent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_SETTINGS } from "../types";

process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-stream-")), "test.db");
process.env.ANTHROPIC_API_KEY = "stream-key";

const enc = new TextEncoder();
const sse = (o: unknown) => enc.encode(`data: ${JSON.stringify(o)}\n\n`);
const delta = (text: string) => sse({ type: "content_block_delta", delta: { type: "text_delta", text } });
let upstream: ReadableStream<Uint8Array>;
globalThis.fetch = (async (url: string | URL | Request) =>
  String(url).includes("/v1/models") ? new Response("{}") : new Response(upstream, { headers: { "content-type": "text/event-stream" } })) as typeof fetch;

const ask = async () => (await import("./index")).aiStreamResponse(DEFAULT_SETTINGS, [{ role: "user", content: "hi" }], () => "offline answer");

test("a reply that ends without a word falls back to the offline answer", async () => {
  upstream = new ReadableStream({ start: (c) => (c.enqueue(sse({ type: "message_stop" })), c.close()) });
  const r = await ask();
  assert.equal(r.headers.get("x-engine"), "heuristic");
  assert.equal(await r.text(), "offline answer");
});

test("a reader that leaves hangs up on the model", async () => {
  let hungUp = false;
  let feed!: ReadableStreamDefaultController<Uint8Array>;
  upstream = new ReadableStream({ start: (c) => ((feed = c), c.enqueue(delta("one"))), cancel: () => void (hungUp = true) });
  const r = await ask();
  const reader = r.body!.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "one");
  await reader.cancel();
  feed.enqueue(delta("two")); // the model writes on: the next chunk finds nobody reading
  await new Promise((done) => setTimeout(done, 20));
  assert.ok(hungUp, "the upstream stream is cancelled");
});
