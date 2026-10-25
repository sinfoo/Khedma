import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-sweep-")), "test.db");

test("automatic archiving never hides an offer the user starred or applied to", async () => {
  const { autoArchive, ensureApplication, getJob, listApplications, updateJob, upsertJob } = await import("@/lib/db");
  const { sweep } = await import("./sweep");
  const job = (url: string, location: string) => ({ title: "Stage Dev", company: "Acme", location, remote: false, url, source: "manual" as const, type: "stage" as const, description: "", tags: [], posted_at: null, deadline: null });

  // One requisition posted in three cities: the user applied to Sfax and starred Sousse.
  const tunis = upsertJob(job("https://x/tunis", "Tunis")).id;
  const sfax = upsertJob(job("https://x/sfax", "Sfax")).id;
  const sousse = upsertJob(job("https://x/sousse", "Sousse")).id;
  ensureApplication(sfax);
  updateJob(sousse, { starred: true });

  const r = sweep();
  assert.equal(r.merged.length, 1);
  assert.equal(r.merged[0].keptId, sfax, "the applied row is the one kept");
  assert.deepEqual(r.merged[0].archived, [tunis]);
  assert.equal(getJob(sousse)?.archived, false, "a starred row is never archived");

  // A board that no longer lists the offer cannot take the application out of the pipeline.
  assert.deepEqual(autoArchive([sfax, sousse]), []);
  updateJob(sfax, { archived: true }); // even an explicit archive keeps the application visible
  assert.deepEqual(listApplications().map((a) => a.job_id), [sfax]);
});
