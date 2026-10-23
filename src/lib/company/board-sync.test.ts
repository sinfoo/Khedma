import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-board-")), "test.db");

test("a complete board listing closes what it no longer lists and reopens what came back", async () => {
  const { upsertJob, ensureApplication, getJob } = await import("@/lib/db");
  const { syncBoard, getChecks } = await import("./index");
  const job = (url: string, company = "Acme") => ({ title: "Dev intern", company, location: "", remote: false, url, source: "greenhouse" as const, type: "stage" as const, description: "", tags: [], posted_at: null, deadline: null });
  const live = upsertJob(job("https://job-boards.greenhouse.io/acme/jobs/1")).id;
  const gone = upsertJob(job("https://job-boards.greenhouse.io/acme/jobs/2")).id;
  const applied = upsertJob(job("https://job-boards.greenhouse.io/acme/jobs/3")).id;
  const other = upsertJob(job("https://job-boards.greenhouse.io/beta/jobs/9", "Beta")).id;
  ensureApplication(applied);

  const closed = syncBoard("greenhouse", { urls: ["https://job-boards.greenhouse.io/acme/jobs/1"], companies: ["Acme"] });
  assert.deepEqual(closed.sort(), [gone, applied].sort());
  assert.equal(getJob(gone)!.archived, true);
  assert.equal(getJob(applied)!.archived, false, "a tracked offer stays in the pipeline");
  assert.equal(getJob(live)!.archived, false);
  assert.equal(getChecks([other]).size, 0, "another employer's offers are untouched");
  assert.equal(getChecks([applied]).get(applied)!.status, "closed");

  assert.deepEqual(syncBoard("greenhouse", { urls: ["https://job-boards.greenhouse.io/acme/jobs/3"], companies: ["Acme"] }), [live]);
  assert.equal(getChecks([applied]).get(applied)!.status, "open", "listed again");
  assert.deepEqual(syncBoard("greenhouse", { urls: [], companies: [] }), [], "an empty listing never closes anything");
});
