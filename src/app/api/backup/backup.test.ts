import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-backup-")), "test.db");

test("backup round trip: validate, merge without duplicates, replace exactly, reset", async () => {
  const { db, upsertJob, ensureApplication, insertEvaluation, kvSet } = await import("@/lib/db");
  const b = await import("./backup");
  const job = (url: string, title = "Dev") => ({ title, company: "Acme", location: "", remote: false, url, source: "manual" as const, type: "stage" as const, description: "", tags: [], posted_at: null, deadline: null });
  const ev = (job_id: number) => ({ job_id, global: 4, match: 4, target: 4, growth: 4, culture: 4, red_flags: 4, strengths: [], gaps: [], flags: [], verdict: "apply" as const, summary: "", engine: "heuristic" });

  const a = upsertJob(job("https://x/1")).id;
  insertEvaluation(ev(a));
  ensureApplication(a);
  kvSet("settings:autoscan", { enabled: true, hours: 6 });
  kvSet("cache:x", 1);
  const snap = b.exportBackup();
  assert.equal(snap.tables.jobs.length, 1);
  assert.ok(!JSON.stringify(snap).includes("ANTHROPIC"), "no env values");

  assert.equal(b.validateBackup({ app: "other" }).error, "not-a-khedma-backup");
  assert.equal(b.validateBackup({ ...snap, tables: { "jobs; DROP TABLE x": [] } }).error?.startsWith("bad-table"), true);
  const { backup } = b.validateBackup(JSON.parse(JSON.stringify(snap)));
  assert.ok(backup);

  // A second job only in the DB, then merge: job 1 already exists so its children are skipped.
  upsertJob(job("https://x/2", "Data"));
  const merged = b.restoreBackup(backup!, "merge");
  const n = (t: string) => (db().prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  assert.equal(n("jobs"), 2);
  assert.equal(n("evaluations"), 1);
  assert.equal(n("applications"), 1);
  assert.ok(merged.inserted >= 0);

  // Merge into an empty DB remaps ids and keeps children attached.
  db().exec("DELETE FROM jobs");
  b.restoreBackup(backup!, "merge");
  const row = db().prepare("SELECT j.url FROM evaluations e JOIN jobs j ON j.id = e.job_id").get() as { url: string };
  assert.equal(row.url, "https://x/1");

  // Replace restores exactly what was exported.
  upsertJob(job("https://x/3"));
  b.restoreBackup(backup!, "replace");
  assert.equal(n("jobs"), 1);
  assert.equal((db().prepare("SELECT id FROM jobs").get() as { id: number }).id, a);
  assert.equal(b.previewBackup(backup!).find((p) => p.table === "jobs")?.current, 1);

  // Reset keeps what belongs to the profile and the settings: the uploaded CV, the clipper token.
  (await import("@/lib/cv/source")).getUpload();
  db().prepare("INSERT INTO cv_uploads (file_name, stored_name, mime, size, text, uploaded_at) VALUES ('cv.pdf','1-cv.pdf','application/pdf',1,'text','2026-01-01')").run();
  kvSet("clip_token", "tok");
  b.resetAll();
  assert.equal(n("cv_uploads"), 1, "the profile's uploaded CV survives a reset");
  assert.equal((db().prepare("SELECT value FROM kv WHERE key = 'clip_token'").get() as { value: string }).value, '"tok"', "the bookmarklet keeps working");
  assert.equal(n("jobs"), 0);
  assert.equal(n("applications"), 0);
  assert.equal(n("profile"), 1);
  assert.equal((db().prepare("SELECT COUNT(*) AS n FROM kv WHERE key = 'settings:autoscan'").get() as { n: number }).n, 1);
  assert.equal((db().prepare("SELECT COUNT(*) AS n FROM kv WHERE key = 'cache:x'").get() as { n: number }).n, 0);
});

test("merge keeps rows keyed by their parent's id (application extras) on the remapped application", async () => {
  const { db, upsertJob, ensureApplication } = await import("@/lib/db");
  const { setExtras, getExtras } = await import("@/lib/repo/apps");
  const b = await import("./backup");
  const job = upsertJob({ title: "Dev", company: "Acme", location: "", remote: false, url: "https://x/extras", source: "manual", type: "stage", description: "", tags: [], posted_at: null, deadline: null }).id;
  setExtras(ensureApplication(job).id, { checklist: ["letter_skipped"] });
  const { backup } = b.validateBackup(JSON.parse(JSON.stringify(b.exportBackup())));
  db().exec("DELETE FROM jobs");
  b.restoreBackup(backup!, "merge");
  const app = db().prepare("SELECT a.id FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.url = 'https://x/extras'").get() as { id: number };
  assert.deepEqual(getExtras(app.id).checklist, ["letter_skipped"]);
});
