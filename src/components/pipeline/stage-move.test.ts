import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-stage-")), "test.db");

test("the follow-up reminder lives only while the application waits in Applied", async () => {
  const { upsertJob, ensureApplication } = await import("@/lib/db");
  const { applyStageChange, openFollowup } = await import("@/lib/repo/apps");
  const job = upsertJob({ title: "Stage PFE", company: "Acme", location: "", remote: false, url: "https://x.test/1", source: "manual", type: "pfe", description: "", tags: [], posted_at: null, deadline: null });
  const app = ensureApplication(job.id);

  applyStageChange(app.id, "applied", "Follow up with {company}");
  assert.equal(openFollowup(app.id)?.title, "Follow up with Acme");
  applyStageChange(app.id, "interview", "x");
  assert.equal(openFollowup(app.id), null, "an interview is not chased with a follow-up");
  applyStageChange(app.id, "applied", "x");
  assert.ok(openFollowup(app.id), "back in Applied, a new reminder is set");
  applyStageChange(app.id, "rejected", "x");
  assert.equal(openFollowup(app.id), null, "a closed application has no reminder left open");
});
