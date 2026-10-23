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
