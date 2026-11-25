import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-runs-")), "test.db");

test("a run left unfinished by a previous server is closed, finished runs are untouched", async () => {
  const { db } = await import("@/lib/db");
  const { listRuns, closeStuckRuns } = await import("./sources");
  listRuns(); // creates the table (and closes nothing: it is empty)
  db().prepare("INSERT INTO scan_runs (started_at, finished_at) VALUES ('2026-10-01T10:00:00Z', '2026-10-01T10:01:00Z')").run();
  db().prepare("INSERT INTO scan_runs (started_at) VALUES ('2026-10-02T10:00:00Z')").run();
  assert.equal(closeStuckRuns(), 1);
  const [stuck, ok] = listRuns();
  assert.equal(stuck.finished_at, "2026-10-02T10:00:00Z");
  assert.equal(stuck.errors, 1);
  assert.equal(ok.finished_at, "2026-10-01T10:01:00Z");
  assert.equal(closeStuckRuns(), 0);
});

test("a scan that throws half-way is recorded as finished and frees the scan lock", async () => {
  const { runScan, listRuns, scanBusy } = await import("./sources");
  // No saved source has this id, so nothing is fetched; the listener fails on the first event.
  await assert.rejects(runScan({ ids: [987654], onEvent: () => { throw new Error("listener gone"); } }), /listener gone/);
  assert.equal(scanBusy(), false);
  assert.ok(listRuns(1)[0].finished_at, "the run does not stay 'running'");
});

test("the restored scan feed keeps the triage outcome of an evaluation", async () => {
  const { upsertJob } = await import("@/lib/db");
  const { insertEvaluationV2 } = await import("./evaluations");
  const { feedState } = await import("./sources");
  const id = upsertJob({ title: "Dev", company: "Acme", location: "", remote: false, url: "https://x/feed", source: "manual", type: "stage", description: "", tags: [], posted_at: null, deadline: null }).id;
  insertEvaluationV2({ job_id: id, global: 2, match: 2, target: 2, growth: 2, culture: 2, red_flags: 4, strengths: [], gaps: [], flags: [], verdict: "skip", summary: "", engine: "heuristic", triage: { score: 10, verdict: "fail", skipped: true, reason: "senior role" } });
  assert.equal(feedState([id])[id].ev?.triage?.reason, "senior role");
});

test("saved sources of a board that became link-only leave the list", async () => {
  const { db } = await import("@/lib/db");
  const { listSourceRows } = await import("./sources");
  listSourceRows();
  db().prepare("INSERT INTO sources (kind, label, handle) VALUES ('keejob', 'Keejob', ''), ('emploitunisie', 'Emploitunisie', '')").run();
  assert.deepEqual(listSourceRows().map((s) => s.kind), ["keejob"]);
});
