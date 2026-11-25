import { test } from "node:test";
import assert from "node:assert/strict";
import { createSaveQueue, type SaveStatus } from "./save-queue";

const defer = () => {
  let resolve!: (v: { ok: boolean }) => void;
  const promise = new Promise<{ ok: boolean }>((r) => (resolve = r));
  return { promise, resolve };
};

test("saves run one at a time, in order, and the status never says saved while one is running", async () => {
  const calls: { v: string; d: ReturnType<typeof defer> }[] = [];
  const statuses: SaveStatus[] = [];
  const q = createSaveQueue<string>((v) => {
    const d = defer();
    calls.push({ v, d });
    return d.promise;
  }, (s) => statuses.push(s));

  q.set("a");
  const first = q.flush();
  await Promise.resolve();
  q.set("b");
  const second = q.flush();
  await Promise.resolve();
  assert.equal(calls.length, 1, "the second save waits for the first");
  assert.equal(q.dirty(), true);

  calls[0].d.resolve({ ok: true });
  assert.equal(await first, true);
  assert.equal(statuses.at(-1) === "saved", false, "b is not saved yet");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls.map((c) => c.v), ["a", "b"]);
  calls[1].d.resolve({ ok: true });
  assert.equal(await second, true);
  assert.equal(statuses.at(-1), "saved");
  assert.equal(q.dirty(), false);
});

test("a failed save reports false and Retry never sends a value older than the latest edit", async () => {
  const sent: string[] = [];
  let ok = false;
  const statuses: SaveStatus[] = [];
  const q = createSaveQueue<string>(async (v) => {
    sent.push(v);
    return { ok };
  }, (s) => statuses.push(s));

  q.set("old");
  assert.equal(await q.flush(), false);
  assert.equal(statuses.at(-1), "error");
  assert.equal(q.dirty(), true, "the failed value is kept for Retry");

  q.set("new");
  ok = true;
  assert.equal(await q.flush(), true);
  assert.equal(await q.flush(), true, "nothing left to send");
  assert.deepEqual(sent, ["old", "new"]);
  assert.equal(statuses.at(-1), "saved");
});

test("a save that throws is an error, not a crash", async () => {
  const q = createSaveQueue<string>(async () => {
    throw new Error("offline");
  }, () => {});
  q.set("x");
  assert.equal(await q.flush(), false);
});
