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

test("new offers at followed companies are listed until the user tracks them", async () => {
  const { ensureApplication, upsertJob } = await import("@/lib/db");
  const { createSourceRow, followedCompanyNews } = await import("@/lib/repo/sources");
  const job = (url: string, company: string) => ({ title: "Stage Data", company, location: "Tunis", remote: false, url, source: "manual" as const, type: "stage" as const, description: "", tags: [], posted_at: null, deadline: null });
  createSourceRow({ kind: "greenhouse", handle: "vermeg", label: "Vermeg", keywords: [], keep_all: true, company: true });
  const a = upsertJob(job("https://x/v1", "VERMEG")).id;
  upsertJob(job("https://x/o1", "Other Co"));
  assert.deepEqual(followedCompanyNews().map((j) => j.id), [a]);
  ensureApplication(a);
  assert.deepEqual(followedCompanyNews(), []);
});

test("a stored offer seen again is refreshed without touching what the user did, and an extended deadline reopens it", async () => {
  const { db, getJob, updateJob, upsertJob } = await import("@/lib/db");
  const { knownIndex } = await import("./store");
  const { sweep } = await import("./sweep");
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const job = { title: "Stage Data", company: "Refresh Co", location: "Tunis", remote: false, url: "https://x/refresh", source: "manual" as const, type: "stage" as const, description: "Short summary.", tags: [], posted_at: null, deadline: day(-5) };
  const id = upsertJob(job).id;
  updateJob(id, { starred: true });
  assert.deepEqual(sweep().expired, [], "a starred offer is never archived as expired");
  updateJob(id, { starred: false });
  assert.deepEqual(sweep().expired, [id]);

  const known = knownIndex();
  assert.equal(known.refresh({ ...job, url: "https://x/another-posting" }), false, "same role at another URL is not this row");
  assert.equal(known.refresh({ ...job, deadline: day(20), description: "Short summary, now with the full text of the posting." }), true);
  const row = db().prepare("SELECT deadline, description, last_seen, archived FROM jobs WHERE id = ?").get(id) as Record<string, unknown>;
  assert.equal(row.deadline, day(20));
  assert.match(String(row.description), /full text/);
  assert.ok(row.last_seen, "the sighting is stamped");
  assert.equal(known.refresh({ ...job, deadline: day(20), description: "Summary." }), false, "nothing changed: a shorter listing text never replaces the stored one");
  assert.match(String(getJob(id)?.description), /full text/);

  assert.deepEqual(sweep().reopened, [id], "the board moved the deadline: the offer is open again");
  assert.equal(getJob(id)?.archived, false);
});

test("offers without an employer name are deduped by URL only and never merged across cities", async () => {
  const { getJob, upsertJob } = await import("@/lib/db");
  const { knownIndex } = await import("./store");
  const { sweep } = await import("./sweep");
  const anon = (city: string) => ({ title: "Développeur web", company: "Tanitjobs", location: city, remote: false, url: `https://x/anon/${city}`, source: "tanitjobs" as never, type: "emploi" as const, description: "", tags: [], posted_at: null, deadline: null });
  const ids = ["Tunis", "Sfax", "Sousse"].map((c) => upsertJob(anon(c)).id);
  const known = knownIndex();
  assert.ok(known.has(anon("Tunis")), "the same URL is known");
  assert.ok(!known.has(anon("Bizerte")), "another anonymous employer with the same title is a new offer");
  assert.ok(known.has({ ...anon("Bizerte"), company: "Acme", title: "Stage Dev", source: "manual" }), "a named employer still dedupes by company + title");
  assert.ok(!sweep().merged.some((m) => ids.includes(m.keptId)));
  assert.ok(ids.every((id) => getJob(id)?.archived === false));
});
