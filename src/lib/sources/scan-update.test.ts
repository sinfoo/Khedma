// A whole scan run twice over one stubbed board: what the second pass reports (new / updated / unchanged), what it
// refreshes, what the request cache spares the board, and what Stop leaves behind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-scan-update-")), "test.db");

let board: { id: number; content: string }[] = [];
let onBoardRead = () => {};
const asked: string[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  asked.push(url);
  if (!url.includes("boards-api.greenhouse.io")) return new Response("<html><body><h1>Stage</h1><a>Apply now</a></body></html>", { headers: { "content-type": "text/html" } });
  onBoardRead();
  if (init?.signal?.aborted) throw new DOMException("This operation was aborted", "AbortError");
  const jobs = board.map((j) => ({ id: j.id, title: `Stage développeur ${j.id}`, absolute_url: `https://job-boards.greenhouse.io/acme/jobs/${j.id}`, location: { name: "Tunis" }, updated_at: "2026-10-20T10:00:00Z", content: j.content }));
  return new Response(JSON.stringify({ jobs }), { headers: { "content-type": "application/json" } });
}) as typeof fetch;

test("a second scan refreshes what it already has and says so; a third one within minutes does not ask the board again", async () => {
  const { db, updateJob } = await import("@/lib/db");
  const { createSourceRow, getSourceRow, runScan } = await import("@/lib/repo/sources");
  type Ev = Parameters<NonNullable<NonNullable<Parameters<typeof runScan>[0]>["onEvent"]>>[0];
  const { clearScanCache } = await import("./http");
  const src = createSourceRow({ kind: "greenhouse", handle: "acme", label: "Acme", keywords: [], keep_all: true, company: true })!;
  const scan = async (signal?: AbortSignal) => {
    const events: Ev[] = [];
    await runScan({ ids: [src], onEvent: (e) => events.push(e), signal });
    const done = events.find((e) => e.type === "done") as Extract<Ev, { type: "done" }>;
    const source = events.find((e) => e.type === "source" && e.status !== "running") as Extract<Ev, { type: "source"; status: "done" | "error" }>;
    return { done, source };
  };
  const boardReads = () => asked.filter((u) => u.includes("boards-api")).length;

  board = [{ id: 1, content: "Stage de fin d'études." }, { id: 2, content: "Stage d'été." }];
  const first = await scan();
  assert.deepEqual([first.done.added, first.done.updated, first.done.duplicates], [2, 0, 0]);
  const id1 = (db().prepare("SELECT id FROM jobs WHERE url LIKE '%/jobs/1'").get() as { id: number }).id;
  updateJob(id1, { starred: true });

  // The employer rewrote posting 1 and opened posting 3.
  clearScanCache();
  board = [{ id: 1, content: "Stage de fin d'études, six mois, équipe plateforme, Tunis." }, { id: 2, content: "Stage d'été." }, { id: 3, content: "Stage PFE data." }];
  const second = await scan();
  assert.deepEqual([second.done.added, second.done.updated, second.done.duplicates], [1, 1, 2], "1 new, 1 updated, 1 unchanged");
  assert.equal(second.source.updated, 1);
  const row = db().prepare("SELECT description, starred, last_seen FROM jobs WHERE id = ?").get(id1) as Record<string, unknown>;
  assert.match(String(row.description), /six mois/);
  assert.equal(row.starred, 1, "the star stays");
  assert.ok(row.last_seen);

  const before = boardReads();
  const third = await scan();
  assert.equal(boardReads(), before, "read two minutes ago: not read again");
  assert.equal(third.source.cached, true);
  assert.deepEqual([third.done.added, third.done.updated, third.done.duplicates], [0, 0, 3]);

  // Stop while the board is being read: not a failure of the board, and its saved row keeps its last real result.
  clearScanCache();
  const lastScan = getSourceRow(src)!.last_scan;
  const ctl = new AbortController();
  onBoardRead = () => ctl.abort();
  const stopped = await scan(ctl.signal);
  onBoardRead = () => {};
  assert.equal(stopped.source.status, "done");
  assert.equal(stopped.source.error, undefined);
  assert.equal(stopped.done.errors, 0);
  assert.deepEqual([getSourceRow(src)!.last_error, getSourceRow(src)!.last_scan], [null, lastScan]);
});
